const { test } = require('node:test');
const assert = require('assert/strict');
const { assertRuntime, assess } = require('./chain-readiness');

const runtime = Array.from({ length: 10 }, (_, index) => ({ id: `container-${index}`, port: 18081 + index,
  running: true, dockerHealth: 'healthy', signatureBypass: 'false', feeFreeMode: 'true' }));
const snapshots = (height, health = true) => runtime.map((node, index) => ({ url: `http://127.0.0.1:${node.port}`,
  status: { address: `validator-${index}`, state: 'SERVING', health }, block: { number: height } }));

test('SERVING and Docker healthy cannot disguise a stalled consensus', () => {
  const result = assess(runtime, snapshots(23086, false), snapshots(23086, false));
  assert.equal(result.checks.consensusHealthy, false);
  assert.equal(result.checks.everyChainAdvancing, false);
  assert.equal(result.pass, false);
});

test('enabled or unproven signature bypass refuses escrow before key creation or transfer', () => {
  for (const signatureBypass of ['true', undefined, '']) {
    assert.throws(() => assertRuntime(runtime.map(node => ({ ...node, signatureBypass }))), /signature verification bypass/);
  }
  assert.doesNotThrow(() => assertRuntime(runtime));
});

test('every independent node must advance and report native consensus health', () => {
  assert.equal(assess(runtime, snapshots(100), snapshots(110)).pass, true);
  const partial = snapshots(110);
  partial[9].block.number = 100;
  assert.equal(assess(runtime, snapshots(100), partial).pass, false);
  partial[9] = { url: partial[9].url, statusError: 'timeout' };
  assert.equal(assess(runtime, snapshots(100), partial).pass, false);
});

test('duplicate validators, missing containers and unapproved fee mode fail closed', () => {
  const duplicate = snapshots(110);
  duplicate[9].status.address = duplicate[0].status.address;
  assert.equal(assess(runtime, snapshots(100), duplicate).pass, false);
  assert.throws(() => assertRuntime(runtime.slice(1)), /ten chain containers/);
  assert.throws(() => assertRuntime(runtime.map(node => ({ ...node, feeFreeMode: 'false' }))), /zero gas prices/);
});
