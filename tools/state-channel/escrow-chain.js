const assert = require('assert/strict');
const fs = require('fs');
const crypto = require('crypto');
const Ain = require('../../lib/ain').default;
const { cooperativeEscrow, replayCooperativeClose, ESCROW_UNITS_PER_AIN } = require('../../lib/state-channel/cooperative-escrow');
const { assertRuntime } = require('./chain-readiness');

const directory = '/evidence';
const privateDirectory = '/private';
const runId = process.env.RUN_ID;
const urls = Array.from({ length: 10 }, (_, index) => `http://127.0.0.1:${18081 + index}`);
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const readJson = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const writeJson = (path, value) => {
  const descriptor = fs.openSync(path, 'wx', 0o600);
  try { fs.writeFileSync(descriptor, JSON.stringify(value, null, 2) + '\n'); fs.fsyncSync(descriptor); }
  finally { fs.closeSync(descriptor); }
};
const emit = value => console.log(JSON.stringify({ at: new Date().toISOString(), ...value }));

function client(account, index = 0) {
  const ain = new Ain(urls[index], null, 0, { axiosConfig: { timeout: 15000 } });
  if (account) ain.wallet.addAndSetDefaultAccount(account.private_key);
  return ain;
}

async function http(index, path) {
  return retryRead(`${urls[index]}${path}`, async () => {
    const response = await fetch(`${urls[index]}${path}`, { signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 200);
    const value = await response.json();
    assert.equal(value.code, 0);
    return value.result;
  });
}

async function retryRead(label, load) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { return await load(); }
    catch (error) {
      emit({ readFailed: label, attempt, error: error.message });
      if (attempt === 3) throw error;
      await sleep(1000);
    }
  }
}

async function finalized(ain, hash) {
  const deadline = Date.now() + 120000;
  let last;
  while (Date.now() < deadline) {
    try { last = await ain.getTransactionByHash(hash); } catch {}
    if (last?.state === 'FINALIZED' || last?.state === 'REVERTED') return last;
    await sleep(1000);
  }
  throw new Error(`transaction remains pending/unknown: ${hash}; inspect this same intent, do not submit a replacement`);
}

async function readState(ain, type, path) {
  const method = { SET_VALUE: 'getValue', SET_RULE: 'getRule', SET_OWNER: 'getOwner', SET_FUNCTION: 'getFunction' }[type];
  return ain.db.ref(path)[method](undefined, { is_final: true });
}

async function submit(ain, label, type, path, value, rejectExpected = false) {
  const intentFile = `${directory}/operations/${label}-intent.json`;
  const operation = { type, ref: path, value };
  let intent;
  let response;
  if (fs.existsSync(intentFile)) {
    intent = readJson(intentFile);
    assert.deepEqual(intent.body.operation, operation, 'cannot change an uncertain transaction intent');
    const responseFile = `${directory}/operations/${label}-response.json`;
    response = fs.existsSync(responseFile) ? readJson(responseFile) : { resumedKnownHash: true };
  } else {
    const body = { operation, nonce: -1, timestamp: Date.now(), gas_price: 0 };
    const signature = ain.wallet.signTransaction(body);
    const hash = `0x${Ain.utils.hashTransaction(body).toString('hex')}`;
    assert.ok(signature.startsWith(hash));
    intent = { label, hash, body, signature, from: ain.wallet.defaultAccount.address, rejectExpected };
    writeJson(intentFile, intent);
    try { response = await ain.sendSignedTransaction(signature, body); }
    catch (error) { response = { transportError: error.message }; }
    writeJson(`${directory}/operations/${label}-response.json`, response);
  }
  if (rejectExpected) {
    assert.ok(response?.result?.code > 0, `negative case not explicitly rejected: ${label}`);
    emit({ label, rejected: true, code: response.result.code, txHash: intent.hash });
    return { hash: intent.hash, response, rejected: true };
  }
  if (response?.result?.code !== undefined) assert.equal(response.result.code, 0, `${label}: ${JSON.stringify(response.result)}`);
  const transaction = await finalized(ain, intent.hash);
  assert.equal(transaction.state, 'FINALIZED', label);
  assert.ok(Number.isSafeInteger(transaction.number));
  const independent = client(null, 5);
  let observed;
  let block;
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    try {
      observed = await readState(independent, type, path);
      block = await http(9, `/get_block_by_number?number=${transaction.number}`);
      if (JSON.stringify(observed) === JSON.stringify(value) && block?.transactions?.some(entry => entry.hash === intent.hash)) break;
      assert.deepEqual(observed, value);
      if (block?.transactions?.some(entry => entry.hash === intent.hash)) break;
    } catch {}
    await sleep(1000);
  }
  assert.deepEqual(observed, value, `${label}: independent finalized state`);
  assert.ok(block?.transactions?.some(entry => entry.hash === intent.hash), `${label}: independent block inclusion`);
  const result = { hash: intent.hash, number: transaction.number, response, transaction, observed, blockHash: block.hash, independentReader: urls[5], blockReader: urls[9] };
  if (!fs.existsSync(`${directory}/operations/${label}-verified.json`)) writeJson(`${directory}/operations/${label}-verified.json`, result);
  emit({ label, finalized: true, txHash: intent.hash, block: transaction.number });
  return result;
}

async function guardChain() {
  assertRuntime(readJson(`${directory}/chain-runtime.json`));
  const fixtures = readJson('/fixtures/genesis_accounts.json');
  const genesis = await http(0, '/get_block_by_number?number=0');
  const admin = await retryRead('consensus admin', () => client(null).db.ref('/manage_app/consensus/config/admin').getValue(undefined, { is_final: true }));
  assert.equal(admin?.[fixtures.owner.address], true, 'not the intended development chain owner');
  const nodes = [];
  const firstBlocks = [];
  for (let index = 0; index < urls.length; index++) {
    const status = await http(index, '/node_status');
    assert.equal(status.state, 'SERVING');
    assert.equal(status.health, true, 'consensus is not healthy; do not open or fund a channel');
    firstBlocks.push(await http(index, '/last_block'));
    const common = await http(index, '/get_block_by_number?number=0');
    assert.equal(common.hash, genesis.hash);
    nodes.push({ url: urls[index], address: status.address, state: status.state, genesisHash: common.hash });
    emit({ guardedNode: urls[index], address: status.address, genesisHash: common.hash });
  }
  assert.equal(new Set(nodes.map(node => node.address)).size, 10);
  await sleep(10000);
  for (let index = 0; index < urls.length; index++) {
    const next = await http(index, '/last_block');
    assert.ok(next.number > firstBlocks[index].number, 'each validator must advance before any transaction');
  }
  return { fixtures, genesisHash: genesis.hash, nodes };
}

async function balances(policy) {
  const reader = client(null, 5);
  const result = {};
  for (const [name, path] of [['source', `/accounts/${policy.terms.source}/balance`], ['target', `/accounts/${policy.terms.target}/balance`], ['escrow', policy.paths.balance]]) {
    result[name] = await reader.db.ref(path).getValue(undefined, { is_final: true });
  }
  return result;
}

async function open() {
  assert.ok(!fs.existsSync(`${directory}/prepared.json`), 'existing channel: use its prepared state, do not open another');
  const chain = await guardChain();
  const owner = client(chain.fixtures.owner);
  const parties = [Ain.utils.createAccount(), Ain.utils.createAccount()];
  const keys = [crypto.generateKeyPairSync('ed25519'), crypto.generateKeyPairSync('ed25519')];
  for (const [index, role] of ['source', 'target'].entries()) {
    writeJson(`${privateDirectory}/${role}.json`, parties[index]);
    fs.writeFileSync(`${privateDirectory}/${role}.pem`, keys[index].privateKey.export({ format: 'pem', type: 'pkcs8' }), { flag: 'wx', mode: 0o600 });
  }
  const opening = { chainId: chain.genesisHash, channelId: runId, openingReference: '0'.repeat(64),
    balances: [String(ESCROW_UNITS_PER_AIN / 2), String(ESCROW_UNITS_PER_AIN / 2)],
    publicKeys: keys.map(key => key.publicKey.export({ format: 'der', type: 'spki' }).toString('base64')) };
  const options = { opening, accounts: parties.map(party => party.address), escrowKey: runId };
  let policy = cooperativeEscrow(options);
  assert.equal(await owner.db.ref(policy.paths.root).getValue(), null);
  assert.equal(await owner.db.ref(policy.paths.balance).getValue(), null);
  const temporary = { '.rule': { write: false }, config: { '.rule': { write: `data === null && auth.addr === ${JSON.stringify(chain.fixtures.owner.address)}` } } };
  await submit(owner, 'initial-policy', 'SET_RULE', policy.paths.root, temporary);
  const configuration = await submit(owner, 'immutable-terms', 'SET_VALUE', policy.paths.config, policy.terms);
  opening.openingReference = configuration.hash.slice(2);
  policy = cooperativeEscrow(options);
  const namespace = await owner.db.ref('/service_accounts/escrow').getRule(undefined, { is_final: true });
  if (namespace === null) {
    await submit(owner, 'service-guard', 'SET_RULE', '/service_accounts/escrow', policy.initialEscrowServiceRules);
  } else {
    const fallback = policy.initialEscrowServiceRules.$service_name;
    assert.deepEqual(namespace.$service_name, fallback, 'unknown existing escrow rule namespace');
    assert.deepEqual(namespace.escrow?.$key, fallback.$key, 'existing fallback differs from genesis semantics');
    await submit(owner, 'service-guard', 'SET_RULE', policy.paths.balance, policy.balanceRule);
  }
  await submit(owner, 'final-policy', 'SET_RULE', policy.paths.root, policy.rules);
  await submit(owner, 'freeze-contract', 'SET_OWNER', policy.paths.root, policy.owners);
  await submit(owner, 'freeze-balance', 'SET_OWNER', policy.paths.balance, policy.owners);
  writeJson(`${directory}/prepared.json`, { runId, options, policy, configuration, chain: { genesisHash: chain.genesisHash, nodes: chain.nodes } });
  for (const [index, role] of ['source', 'target'].entries()) {
    await submit(owner, `seed-${role}`, 'SET_VALUE', `/transfer/${chain.fixtures.owner.address}/${parties[index].address}/${runId}/value`, 10);
  }
  const source = client(parties[0]);
  const target = client(parties[1]);
  const before = await balances(policy);
  await submit(source, 'deposit-source', 'SET_VALUE', policy.paths.hold, { amount: policy.depositsAIN[0] });
  await submit(target, 'deposit-target', 'SET_VALUE', policy.paths.targetDeposit, policy.depositsAIN[1]);
  const funded = await balances(policy);
  assert.equal(funded.escrow, 1);
  assert.equal(Math.round((before.source - funded.source) * ESCROW_UNITS_PER_AIN), Number(opening.balances[0]));
  assert.equal(Math.round((before.target - funded.target) * ESCROW_UNITS_PER_AIN), Number(opening.balances[1]));
  writeJson(`${directory}/funded.json`, { runId, before, funded, assets: 'native AIN balances on the guarded local development chain; not test-credit checkpoints' });
  emit({ open: true, runId, funded, openingReference: configuration.hash });
}

async function settle() {
  const prepared = readJson(`${directory}/prepared.json`);
  const chain = await guardChain();
  assert.equal(chain.genesisHash, prepared.chain.genesisHash);
  const { options, policy } = prepared;
  assert.deepEqual(cooperativeEscrow(options), policy);
  const source = client(readJson(`${privateDirectory}/source.json`));
  const target = client(readJson(`${privateDirectory}/target.json`));
  const owner = client(chain.fixtures.owner);
  const journal = fs.readFileSync(`${directory}/receipts.jsonl`);
  const receipts = journal.toString('utf8').trim().split('\n').map(line => JSON.parse(line));
  const close = replayCooperativeClose(options, receipts);
  const peer = readJson(`${directory}/peer-result.json`);
  assert.equal(close.sequence, peer.state.sequence);
  assert.equal(close.stateHash, `0x${peer.state.head}`);
  assert.deepEqual([String(close.balanceA), String(close.balanceB)], peer.state.balances);
  assert.equal(readJson(`${directory}/recovery-result.json`).pass, true);
  const before = await balances(policy);
  await submit(source, 'reject-missing-approval', 'SET_VALUE', policy.paths.release, { ratio: 1 }, true);
  await submit(source, 'approve-source', 'SET_VALUE', policy.paths.sourceApproval, close);
  await submit(source, 'reject-one-approval', 'SET_VALUE', policy.paths.release, { ratio: close.balanceB / policy.totalUnits }, true);
  await submit(target, 'reject-inflation', 'SET_VALUE', policy.paths.targetApproval, { ...close, balanceB: close.balanceB + 1 }, true);
  await submit(target, 'reject-foreign-approval', 'SET_VALUE', policy.paths.sourceApproval, close, true);
  await submit(owner, 'reject-policy-replacement', 'SET_RULE', policy.paths.root, { '.rule': { write: true } }, true);
  await submit(source, 'reject-native-installation', 'SET_FUNCTION', `/apps/${runId}/forged`, { '.function': { _transfer: { function_type: 'NATIVE', function_id: '_transfer' } } }, true);
  assert.deepEqual(await balances(policy), before, 'negative calls must not move native balances (gas_price=0)');
  await submit(target, 'approve-target', 'SET_VALUE', policy.paths.targetApproval, close);
  await submit(source, 'reject-wrong-ratio', 'SET_VALUE', policy.paths.release, { ratio: 1 }, true);
  const payout = await submit(source, 'cooperative-release', 'SET_VALUE', policy.paths.release, { ratio: close.balanceB / policy.totalUnits });
  const after = await balances(policy);
  assert.equal(after.escrow, 0);
  assert.equal(Math.round((after.source - before.source) * ESCROW_UNITS_PER_AIN), close.balanceA);
  assert.equal(Math.round((after.target - before.target) * ESCROW_UNITS_PER_AIN), close.balanceB);
  await submit(target, 'reject-duplicate-release', 'SET_VALUE', policy.paths.release, { ratio: close.balanceB / policy.totalUnits }, true);
  assert.deepEqual(await balances(policy), after);
  writeJson(`${directory}/settled.json`, { runId, close, before, after, payout,
    journalSha256: crypto.createHash('sha256').update(journal).digest('hex'),
    nativePrecision: 'raw AIN ledger uses JavaScript numbers; allocations/read-back audited at 1e-6 AIN, raw balances and receipts retained',
    pass: true, performance7000TPS: false, unilateralDisputeOrTimeout: false });
  emit({ settled: true, runId, transfers: close.sequence, before, after, txHash: payout.hash });
}

async function main() {
  assert.match(runId ?? '', /^[A-Za-z0-9_-]{1,100}$/);
  fs.mkdirSync(`${directory}/operations`, { recursive: true });
  if (process.argv[2] === 'open') await open();
  else if (process.argv[2] === 'settle') await settle();
  else throw new Error('use open or settle');
}

main().catch(error => { emit({ failed: true, error: error.message }); process.exitCode = 1; });
