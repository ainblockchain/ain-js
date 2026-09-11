const assert = require('assert/strict');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const chainRoot = process.env.AIN_BLOCKCHAIN_SOURCE || '/app/ain-blockchain';
const BlockchainNode = require(path.join(chainRoot, 'node'));
const Transaction = require(path.join(chainRoot, 'tx-pool/transaction'));
const { NodeConfigs } = require(path.join(chainRoot, 'common/constants'));
const { setNodeForTesting } = require(path.join(chainRoot, 'test/test-util'));
const Ain = require('../../lib/ain').default;
const { PaymentChannel } = require('../../lib/state-channel');
const { cooperativeEscrow, replayCooperativeClose } = require('../../lib/state-channel/cooperative-escrow');

async function main() {
  fs.accessSync('/evidence', fs.constants.W_OK);
  assert.ok(!fs.existsSync('/evidence/operations.jsonl'), 'use a new evidence directory');
  assert.equal(NodeConfigs.ENABLE_TX_SIG_VERIF_WORKAROUND, false);
  assert.equal(NodeConfigs.ENABLE_GAS_FEE_WORKAROUND, true);
  assert.ok(NodeConfigs.CHAINS_DIR.startsWith('/tmp/'), 'use an isolated /tmp chain, never a mounted live volume');
  const node = new BlockchainNode();
  await setNodeForTesting(node, 0, true);
  const owner = require(path.join(chainRoot, 'blockchain-configs/base/genesis_accounts.json')).owner;
  const parties = [Ain.utils.createAccount(), Ain.utils.createAccount()];
  const keys = [crypto.generateKeyPairSync('ed25519'), crypto.generateKeyPairSync('ed25519')];
  const opening = { chainId: node.bc.getBlockByNumber(0).hash, channelId: 'native-db-cooperative', openingReference: '0'.repeat(64),
    balances: ['500000', '500000'], publicKeys: keys.map(key => key.publicKey.export({ type: 'spki', format: 'der' }).toString('base64')) };
  const options = { opening, accounts: parties.map(party => party.address), escrowKey: 'native-db-check' };
  let policy = cooperativeEscrow(options);
  const operations = [];
  let timestamp = Date.now();
  function submit(account, label, type, ref, value, rejected = false) {
    const ain = new Ain('http://127.0.0.1:1', null, 0);
    ain.wallet.addAndSetDefaultAccount(account.private_key);
    const body = { operation: { type, ref, value }, nonce: -1, timestamp: timestamp++, gas_price: 0 };
    const signature = ain.wallet.signTransaction(body);
    const transaction = Transaction.create(body, signature, 0);
    assert.ok(transaction, `${label}: executable signed transaction`);
    assert.equal(transaction.address, account.address);
    assert.equal(transaction.extra.skip_verif, undefined);
    assert.equal(Transaction.verifyTransaction(transaction, 0), true);
    const before = node.db.getStateProof('/');
    const result = node.db.executeTransaction(transaction, false, true, node.bc.lastBlockNumber() + 1, body.timestamp);
    operations.push({ label, hash: transaction.hash, from: account.address, body, signature, result });
    fs.appendFileSync('/evidence/operations.jsonl', JSON.stringify(operations[operations.length - 1]) + '\n');
    console.log(JSON.stringify({ label, code: result.code, expectedRejection: rejected }));
    if (rejected) {
      assert.ok(result.code > 0, `${label}: expected explicit rejection: ${JSON.stringify(result)}`);
      assert.deepEqual(node.db.getStateProof('/'), before, `${label}: rejected operation must roll back the entire DB`);
    } else assert.equal(result.code, 0, `${label}: ${JSON.stringify(result)}`);
    return transaction.hash;
  }
  submit(owner, 'temporary-policy', 'SET_RULE', policy.paths.root, { '.rule': { write: false }, config: { '.rule': { write: `data === null && auth.addr === '${owner.address}'` } } });
  opening.openingReference = submit(owner, 'terms', 'SET_VALUE', policy.paths.config, policy.terms).slice(2);
  policy = cooperativeEscrow(options);
  submit(owner, 'balance-guard', 'SET_RULE', '/service_accounts/escrow', policy.initialEscrowServiceRules);
  submit(owner, 'policy', 'SET_RULE', policy.paths.root, policy.rules);
  submit(owner, 'freeze-contract', 'SET_OWNER', policy.paths.root, policy.owners);
  submit(owner, 'freeze-balance', 'SET_OWNER', policy.paths.balance, policy.owners);
  for (const [index, party] of parties.entries()) submit(owner, `seed-${index}`, 'SET_VALUE', `/transfer/${owner.address}/${party.address}/seed/value`, 10);
  submit(parties[0], 'hold', 'SET_VALUE', policy.paths.hold, { amount: 0.5 });
  submit(parties[1], 'target-deposit', 'SET_VALUE', policy.paths.targetDeposit, 0.5);
  assert.equal(node.db.getValue(policy.paths.balance), 1);
  submit(owner, 'unsolicited-deposit', 'SET_VALUE', `/transfer/${owner.address}/${policy.serviceAccount}/extra/value`, 1, true);
  submit(owner, 'negative-deposit', 'SET_VALUE', `/transfer/${owner.address}/${policy.serviceAccount}/negative/value`, -1, true);
  submit(parties[0], 'unauthorized-withdrawal', 'SET_VALUE', `/transfer/${policy.serviceAccount}/${parties[0].address}/forged/value`, 1, true);
  const sender = new PaymentChannel(opening);
  const receiver = new PaymentChannel(opening);
  const receipts = [];
  for (let index = 0; index < 20; index++) {
    const receipt = receiver.accept(sender.propose(0, '3', keys[0].privateKey), keys[1].privateKey);
    sender.commit(receipt);
    receipts.push(receipt);
  }
  const close = replayCooperativeClose(options, receipts);
  const release = { ratio: close.balanceB / policy.totalUnits };
  submit(parties[0], 'missing-approvals', 'SET_VALUE', policy.paths.release, release, true);
  submit(parties[0], 'source-approval', 'SET_VALUE', policy.paths.sourceApproval, close);
  submit(parties[0], 'one-approval', 'SET_VALUE', policy.paths.release, release, true);
  submit(parties[1], 'inflated-approval', 'SET_VALUE', policy.paths.targetApproval, { ...close, balanceB: close.balanceB + 1 }, true);
  submit(parties[1], 'foreign-approval', 'SET_VALUE', policy.paths.sourceApproval, close, true);
  submit(owner, 'frozen-contract', 'SET_RULE', policy.paths.root, { '.rule': { write: true } }, true);
  submit(parties[0], 'owner-only-native', 'SET_FUNCTION', '/apps/native_db_forged/transfer', { '.function': { _transfer: { function_type: 'NATIVE', function_id: '_transfer' } } }, true);
  submit(parties[1], 'target-approval', 'SET_VALUE', policy.paths.targetApproval, close);
  submit(parties[0], 'wrong-ratio', 'SET_VALUE', policy.paths.release, { ratio: 1 }, true);
  const before = parties.map(party => node.db.getValue(`/accounts/${party.address}/balance`));
  submit(parties[0], 'native-release', 'SET_VALUE', policy.paths.release, release);
  const after = parties.map(party => node.db.getValue(`/accounts/${party.address}/balance`));
  assert.equal(node.db.getValue(policy.paths.balance), 0);
  assert.deepEqual(after.map((balance, index) => Math.round((balance - before[index]) * 1000000)), [close.balanceA, close.balanceB]);
  submit(parties[1], 'duplicate-release', 'SET_VALUE', policy.paths.release, release, true);
  fs.writeFileSync('/evidence/native-db.json', JSON.stringify({ scope: 'isolated native DB execution and rollback, NOT ten-node finalized consensus or TPS',
    signatureBypass: false, feeFreeMode: true, pass: true, finalizedOnChain: false,
    before, after, close, options, receipts, operations }, null, 2) + '\n', { flag: 'wx' });
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
