const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const Ain = require('../../lib/ain').default;
const { loadNetwork } = require('./escrow-network');
const { replayCooperativeClose, microUnitEscrowRelease, nativeEscrowRelease } = require('../../lib/state-channel/cooperative-escrow');

async function main() {
  const [directory, output, selectedLabel] = process.argv.slice(2);
  assert.ok(directory && output && !fs.existsSync(output), 'existing run and NEW audit filename required');
  const read = name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
  const prepared = read('prepared.json');
  if (selectedLabel) assert.match(selectedLabel, /^[a-z-]+$/);
  const network = loadNetwork();
  const receipts = fs.readFileSync(path.join(directory, 'receipts.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const close = replayCooperativeClose(prepared.options, receipts);
  const funded = read('funded.json');
  const settled = selectedLabel ? { close, after: {
    source: funded.funded.source + close.balanceA / 1000000,
    target: funded.funded.target + close.balanceB / 1000000, escrow: 0,
  } } : read('settled.json');
  assert.deepEqual(close, settled.close);
  assert.equal(read('recovery-result.json').pass, true);
  const release = network.nativeReleaseVersion === 2 ? microUnitEscrowRelease(close) : nativeEscrowRelease(close);
  const intent = read(`operations/${selectedLabel ?? 'cooperative-release'}-intent.json`);
  assert.equal(intent.hash, `0x${Ain.utils.hashTransaction(intent.body).toString('hex')}`);
  if (!selectedLabel) assert.equal(intent.hash, settled.payout.hash);
  assert.deepEqual(intent.body.operation, { type: 'SET_VALUE', ref: prepared.policy.paths.release, value: release });
  const policy = prepared.policy;
  const paths = { source: `/accounts/${policy.terms.source}/balance`, target: `/accounts/${policy.terms.target}/balance`,
    escrow: policy.paths.balance, release: policy.paths.release,
    sourceTransfer: `/transfer/${policy.serviceAccount}/${policy.terms.source}/${intent.body.timestamp}/value`,
    targetTransfer: `/transfer/${policy.serviceAccount}/${policy.terms.target}/${intent.body.timestamp}/value`,
    sourceApproval: policy.paths.sourceApproval, targetApproval: policy.paths.targetApproval };
  const observations = [];
  for (const index of [5, 9]) {
    const url = `http://127.0.0.1:${network.rpcPortBase + index}`;
    const reader = new Ain(url, null, 0, { axiosConfig: { timeout: 15000 } });
    const entry = { url, at: new Date().toISOString(), values: {} };
    try {
      const genesisResponse = await fetch(`${url}/get_block_by_number?number=0`, { signal: AbortSignal.timeout(15000) });
      assert.equal(genesisResponse.status, 200);
      const genesis = await genesisResponse.json();
      assert.equal(genesis.result.hash, prepared.chain.genesisHash);
      entry.transaction = await reader.getTransactionByHash(intent.hash);
      assert.equal(entry.transaction.state, 'FINALIZED');
      assert.equal(entry.transaction.is_finalized, true);
      assert.equal(entry.transaction.transaction.hash, intent.hash);
      assert.deepEqual(entry.transaction.transaction.tx_body, intent.body);
      if (!selectedLabel) assert.equal(entry.transaction.number, settled.payout.number);
      for (const [name, ref] of Object.entries(paths)) entry.values[name] = await reader.db.ref(ref).getValue(undefined, { is_final: true });
      assert.deepEqual(entry.values.release, release);
      assert.deepEqual(entry.values.sourceApproval, close);
      assert.deepEqual(entry.values.targetApproval, close);
      assert.equal(entry.values.sourceTransfer, close.balanceA / 1000000);
      assert.equal(entry.values.targetTransfer, close.balanceB / 1000000);
      for (const name of ['source', 'target', 'escrow']) assert.equal(entry.values[name], settled.after[name]);
      assert.equal(entry.values.escrow, 0);
      const response = await fetch(`${url}/get_block_by_number?number=${entry.transaction.number}`, { signal: AbortSignal.timeout(15000) });
      assert.equal(response.status, 200);
      const block = await response.json();
      assert.ok(block.result.transactions.some(transaction => transaction.hash === intent.hash));
      entry.block = { number: block.result.number, hash: block.result.hash, containsIntent: true };
      entry.pass = true;
    } catch (error) { entry.error = error.message; entry.pass = false; }
    observations.push(entry);
  }
  const pass = observations.every(entry => entry.pass) && observations[0].block.hash === observations[1].block.hash;
  fs.writeFileSync(output, JSON.stringify({ at: new Date().toISOString(), runId: prepared.runId,
    scope: 'read-only exact signed intent, replayed receipts, both payouts and independent finalized ledger audit; no keys or submissions',
    pass, finalizedOnChain: pass, scenarioPassed: selectedLabel ? false : pass,
    selectedIntentLabel: selectedLabel ?? 'cooperative-release', reconciliation: Boolean(selectedLabel),
    transactionHash: intent.hash, observations }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ output, pass, transactionHash: intent.hash }));
  process.exitCode = pass ? 0 : 1;
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
