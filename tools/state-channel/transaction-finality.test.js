const { test } = require('node:test');
const assert = require('assert/strict');
const { waitFinalized, assertOutcome } = require('./transaction-finality');

test('an initially failed execution can remain pending and later finalize successfully', async () => {
  const states = [null, { state: 'REVERTED', is_finalized: false }, { state: 'FINALIZED', is_finalized: true, number: 520 }];
  let clock = 0;
  const result = await waitFinalized(async hash => { assert.equal(hash, 'original-hash'); return states.shift(); }, 'original-hash',
    { now: () => clock, pause: async milliseconds => { clock += milliseconds; } });
  assert.equal(clock, 2000);
  assert.equal(result.state, 'FINALIZED');
  assert.throws(() => assertOutcome(result, true, 'expected-rejection'), /unexpected finalized outcome/);
  assert.doesNotThrow(() => assertOutcome(result, false, 'actual-payment'));
});

test('only finalized reversion proves an on-chain negative test', async () => {
  assert.throws(() => assertOutcome({ state: 'REVERTED', is_finalized: false, number: 1 }, true, 'negative'));
  const result = await waitFinalized(async () => ({ state: 'REVERTED', is_finalized: true, number: 5 }), 'same-hash');
  assert.doesNotThrow(() => assertOutcome(result, true, 'negative'));
  assert.throws(() => assertOutcome(result, false, 'payment'));
});

test('unknown state or read errors time out without resubmitting or accepting admission failure', async () => {
  let clock = 0;
  let reads = 0;
  await assert.rejects(waitFinalized(async hash => { reads++; assert.equal(hash, 'same-hash'); throw new Error('read timeout'); }, 'same-hash',
    { now: () => clock, pause: async milliseconds => { clock += milliseconds; }, timeoutMs: 3000 }), /do not submit a replacement/);
  assert.equal(reads, 3);
});
