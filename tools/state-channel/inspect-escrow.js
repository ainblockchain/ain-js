const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const Ain = require('../../lib/ain').default;

async function main() {
  const [directory, output] = process.argv.slice(2);
  assert.ok(directory && output && !fs.existsSync(output), 'pass an existing evidence directory and a new output filename');
  const read = name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
  const prepared = read('prepared.json');
  const funded = read('funded.json');
  const intent = read('operations/cooperative-release-intent.json');
  const response = read('operations/cooperative-release-response.json');
  assert.equal(intent.hash, `0x${Ain.utils.hashTransaction(intent.body).toString('hex')}`);
  assert.equal(intent.body.operation.type, 'SET_VALUE');
  assert.equal(intent.body.operation.ref, prepared.policy.paths.release);
  assert.equal(response.result.code, 10104);
  const paths = {
    source: `/accounts/${prepared.policy.terms.source}/balance`,
    target: `/accounts/${prepared.policy.terms.target}/balance`,
    escrow: prepared.policy.paths.balance,
    release: prepared.policy.paths.release,
    sourceTransfer: `/transfer/${prepared.policy.serviceAccount}/${prepared.policy.terms.source}/${intent.body.timestamp}/value`,
    targetTransfer: `/transfer/${prepared.policy.serviceAccount}/${prepared.policy.terms.target}/${intent.body.timestamp}/value`,
    sourceApproval: prepared.policy.paths.sourceApproval,
    targetApproval: prepared.policy.paths.targetApproval,
  };
  const observations = [];
  for (const port of [18086, 18090]) {
    const url = `http://127.0.0.1:${port}`;
    const reader = new Ain(url, null, 0, { axiosConfig: { timeout: 15000 } });
    const entry = { url, at: new Date().toISOString(), values: {} };
    try {
      entry.transaction = await reader.getTransactionByHash(intent.hash);
      for (const [name, ref] of Object.entries(paths)) {
        entry.values[name] = await reader.db.ref(ref).getValue(undefined, { is_final: true });
      }
      const blockResponse = await fetch(`${url}/get_block_by_number?number=${entry.transaction?.number}`, { signal: AbortSignal.timeout(15000) });
      assert.equal(blockResponse.status, 200);
      const block = await blockResponse.json();
      assert.equal(block.code, 0);
      entry.block = { number: block.result?.number, hash: block.result?.hash,
        containsIntent: block.result?.transactions?.some(transaction => transaction.hash === intent.hash) === true };
      assert.equal(entry.transaction.state, 'REVERTED');
      assert.equal(entry.transaction.is_finalized, true);
      assert.deepEqual(entry.transaction.transaction.tx_body, intent.body);
      assert.equal(entry.transaction.transaction.hash, intent.hash);
      assert.equal(entry.block.containsIntent, true);
      for (const name of ['source', 'target', 'escrow']) assert.equal(entry.values[name], funded.funded[name], name);
      for (const name of ['release', 'sourceTransfer', 'targetTransfer']) assert.equal(entry.values[name], null, name);
      assert.ok(entry.values.sourceApproval);
      assert.deepEqual(entry.values.sourceApproval, entry.values.targetApproval);
      entry.noObservedPartialPayout = true;
    } catch (error) { entry.error = error.message; entry.noObservedPartialPayout = false; }
    observations.push(entry);
  }
  const verified = observations.every(entry => entry.noObservedPartialPayout)
    && observations[0].block.hash === observations[1].block.hash;
  const report = { at: new Date().toISOString(), runId: prepared.runId, transactionHash: intent.hash,
    scope: 'read-only exact-intent and independent finalized-state audit; no keys, submissions, retries or restarts',
    rejectedSettlementVerified: verified, settlementSuccessful: false, fundsRecovered: false,
    observations };
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ output, rejectedSettlementVerified: verified, settlementSuccessful: false, fundsRecovered: false }));
  process.exitCode = verified ? 0 : 1;
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
