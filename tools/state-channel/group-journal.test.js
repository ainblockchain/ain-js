const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { GroupCommitJournal, replayGroupJournal } = require('../../lib/state-channel/group-journal');

const entry = index => ({ channelId: `channel-${index}`, receipt: { state: { sequence: 1 }, signatures: ['a', 'b'] } });

test('several independent receipts share one fsync and none resolves before durability', async () => {
  let release;
  let entered;
  const synchronizing = new Promise(resolve => { entered = resolve; });
  const durable = new Promise(resolve => { release = resolve; });
  const journal = new GroupCommitJournal({ write: async (buffer, offset, length) => ({ bytesWritten: Math.min(length, 11) }),
    sync: async () => { entered(); await durable; }, close: async () => undefined }, { maxDelayMs: 0 });
  let acknowledged = 0;
  const waiting = Array.from({ length: 32 }, (_, index) => journal.append(entry(index)).then(() => acknowledged++));
  await synchronizing;
  assert.equal(acknowledged, 0);
  release();
  await Promise.all(waiting);
  await journal.close();
  assert.equal(acknowledged, 32);
  assert.equal(journal.metrics.batches, 1);
  assert.equal(journal.metrics.peakBatch, 32);
});

test('write or fsync failure rejects the entire batch and faults future appends', async () => {
  for (const phase of ['write', 'sync']) {
    const journal = new GroupCommitJournal({
      write: async (buffer, offset, length) => { if (phase === 'write') throw new Error('disk failed'); return { bytesWritten: length }; },
      sync: async () => { if (phase === 'sync') throw new Error('disk failed'); }, close: async () => undefined,
    }, { maxDelayMs: 0 });
    const outcomes = await Promise.allSettled([journal.append(entry(0)), journal.append(entry(1))]);
    assert.ok(outcomes.every(outcome => outcome.status === 'rejected'));
    assert.equal(journal.metrics.entries, 0);
    await assert.rejects(journal.append(entry(2)), /disk failed/);
    await assert.rejects(journal.close(), /disk failed/);
  }
});

test('replay validates complete frames, reports an uncommitted tail and rejects corruption', async context => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ain-group-journal-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'journal.jsonl');
  const journal = await GroupCommitJournal.create(filename, { maxBatchRecords: 16, maxDelayMs: 0 });
  await Promise.all(Array.from({ length: 40 }, (_, index) => journal.append(entry(index))));
  await journal.close();
  const restored = [];
  const verified = await replayGroupJournal(filename, value => restored.push(value));
  assert.equal(verified.entries, 40);
  assert.equal(verified.batches, 3);
  assert.equal(verified.incompleteTailBytes, 0);
  assert.deepEqual(restored, Array.from({ length: 40 }, (_, index) => entry(index)));
  fs.appendFileSync(filename, '{"incomplete":');
  const partial = await replayGroupJournal(filename, () => undefined);
  assert.equal(partial.entries, 40);
  assert.equal(partial.incompleteTailBytes, 14);
  const corrupted = path.join(directory, 'corrupt.jsonl');
  fs.writeFileSync(corrupted, fs.readFileSync(filename, 'utf8').replace('channel-0', 'channel-x'));
  await assert.rejects(replayGroupJournal(corrupted, () => undefined), /invalid journal frame/);
  await assert.rejects(GroupCommitJournal.create(filename), /EEXIST/);
});

test('writer refuses an oversized frame before persisting or acknowledging it', async () => {
  let written = false;
  const journal = new GroupCommitJournal({ write: async (buffer, offset, length) => { written = true; return { bytesWritten: length }; },
    sync: async () => undefined, close: async () => undefined }, { maxDelayMs: 0 });
  const oversized = entry(0);
  oversized.receipt.state.padding = 'x'.repeat(16 * 1024 ** 2);
  await assert.rejects(journal.append(oversized), /frame exceeds limit/);
  assert.equal(written, false);
  assert.equal(journal.metrics.entries, 0);
  await assert.rejects(journal.close(), /frame exceeds limit/);
});
