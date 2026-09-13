const fs = require('fs');
const assert = require('assert/strict');
const crypto = require('crypto');
const Ain = require('../../lib/ain').default;
const { PaymentChannel } = require('../../lib/state-channel');
const { createPaymentPeer, postPayment } = require('../../lib/state-channel/http-peer');
const { transferCount, transferUnits } = require('./escrow-scenario');
const { loadNetwork } = require('./escrow-network');

const directory = '/evidence';
const network = loadNetwork();
const endpoint = `http://127.0.0.1:${network.peerPort}`;
const read = name => JSON.parse(fs.readFileSync(`${directory}/${name}`));
const prepared = read('prepared.json');

async function ready() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${endpoint}/state`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return response.json();
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('peer remains unavailable; inspect this experiment peer, do not reset the chain');
}

async function verifyFunding() {
  const reader = new Ain(`http://127.0.0.1:${network.rpcPortBase + 5}`, null, 0, { axiosConfig: { timeout: 15000 } });
  const { policy, configuration } = prepared;
  assert.deepEqual(await reader.db.ref(policy.paths.config).getValue(undefined, { is_final: true }), policy.terms);
  assert.deepEqual(await reader.db.ref(policy.paths.root).getRule(undefined, { is_final: true }), policy.rules);
  assert.deepEqual(await reader.db.ref(policy.paths.root).getOwner(undefined, { is_final: true }), policy.owners);
  assert.deepEqual(await reader.db.ref(policy.paths.balance).getRule(undefined, { is_final: true }), policy.balanceRule);
  assert.deepEqual(await reader.db.ref(policy.paths.balance).getOwner(undefined, { is_final: true }), policy.owners);
  assert.equal(await reader.db.ref(policy.paths.balance).getValue(undefined, { is_final: true }), 1);
  const response = await fetch(`http://127.0.0.1:${network.rpcPortBase + 9}/get_block_by_number?number=${configuration.number}`, { signal: AbortSignal.timeout(15000) });
  const block = await response.json();
  assert.ok(block.result?.transactions?.some(transaction => transaction.hash === configuration.hash));
  console.log(JSON.stringify({ fundingVerified: true, by: process.argv[2], openingReference: configuration.hash, escrowAIN: 1 }));
}

async function main() {
  await verifyFunding();
  const mode = process.argv[2];
  if (mode === 'server') {
    const channel = new PaymentChannel(prepared.options.opening);
    const journal = `${directory}/receipts.jsonl`;
    if (fs.existsSync(journal)) for (const line of fs.readFileSync(journal, 'utf8').split('\n').filter(Boolean)) channel.commit(JSON.parse(line));
    const descriptor = fs.openSync(journal, 'a', 0o600);
    const key = crypto.createPrivateKey(fs.readFileSync('/private/key.pem'));
    createPaymentPeer(channel, key, async receipt => {
      fs.writeSync(descriptor, JSON.stringify(receipt) + '\n');
      fs.fsyncSync(descriptor);
    }).listen(network.peerPort, '127.0.0.1', () => console.log(JSON.stringify({ ready: true, recoveredSequence: channel.snapshot().sequence })));
    return;
  }
  if (mode === 'recover') {
    const prior = read('peer-result.json');
    assert.deepEqual(await ready(), prior.state);
    assert.deepEqual(await postPayment(endpoint, prior.lastProposal), prior.state.receipt);
    assert.deepEqual(await ready(), prior.state);
    fs.writeFileSync(`${directory}/recovery-result.json`, JSON.stringify({ pass: true, sequence: prior.state.sequence, after: 'SIGKILL and journal replay, same funded channel, duplicate delivery not debited again' }), { flag: 'wx' });
    return;
  }
  assert.equal(mode, 'client');
  const channel = new PaymentChannel(prepared.options.opening);
  assert.deepEqual(await ready(), channel.snapshot());
  const key = crypto.createPrivateKey(fs.readFileSync('/private/key.pem'));
  let lastProposal;
  const timings = [];
  for (let index = 0; index < transferCount; index++) {
    lastProposal = channel.propose(0, String(transferUnits), key);
    const started = process.hrtime.bigint();
    const receipt = await postPayment(endpoint, lastProposal);
    channel.commit(receipt);
    timings.push(Number(process.hrtime.bigint() - started) / 1e6);
    assert.deepEqual(await postPayment(endpoint, lastProposal), receipt);
  }
  assert.deepEqual(await ready(), channel.snapshot());
  assert.equal(fs.readFileSync(`${directory}/receipts.jsonl`, 'utf8').trim().split('\n').length, transferCount);
  fs.writeFileSync(`${directory}/peer-result.json`, JSON.stringify({ state: channel.snapshot(), lastProposal, timingsMs: timings,
    microAINTransferred: transferCount * transferUnits, scope: 'funded cooperative channel and crash recovery, not a 7000TPS benchmark' }, null, 2), { flag: 'wx' });
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
