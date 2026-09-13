import type Ain from '../src/ain';
import { ExperimentPublisher, KpiEvent } from '../src/experiment';

const event: KpiEvent = { version: 1, id: 'start', runId: 'run', nodeId: 'worker', observedAt: 100,
  kind: 'training', jobId: 'job', datasetId: 'dataset', path: '/apps/jobs/job', state: 'running', startedAt: 100 };

function setup() {
  const reference = { getValue: jest.fn().mockResolvedValue(null),
    setValue: jest.fn().mockResolvedValue({ tx_hash: 'hash', result: { code: 0 } }) };
  const ain = { rawResultMode: false, db: { ref: jest.fn().mockReturnValue(reference) },
    getTransactionByHash: jest.fn(), getBlockByNumber: jest.fn() };
  return { ain, reference, publisher: new ExperimentPublisher(ain as unknown as Ain, 'run') };
}

test('publishes through the signed SDK database API and captures submission time', async () => {
  const { publisher, reference } = setup();
  const before = Date.now();
  const submission = await publisher.publish(event);
  expect(submission.path).toBe('/apps/ainize_kpi/runs/run/events/start');
  expect(submission.txHash).toBe('hash');
  expect(submission.submittedAt).toBeGreaterThanOrEqual(before);
  expect(reference.setValue).toHaveBeenCalledWith({ value: event, nonce: -1, timestamp: submission.submittedAt });
});

test('refuses overwrites, mixed runs, unknown fields and rejected transactions', async () => {
  const { publisher, reference } = setup();
  await expect(publisher.publish({ ...event, runId: 'other' })).rejects.toThrow('mismatch');
  await expect(publisher.publish({ ...event, token: 'secret' } as KpiEvent)).rejects.toThrow('unknown event field');
  reference.getValue.mockResolvedValue(event);
  await expect(publisher.publish(event)).rejects.toThrow('already exists');
  expect(reference.setValue).not.toHaveBeenCalled();
  reference.getValue.mockResolvedValue(null);
  reference.setValue.mockResolvedValue({ tx_hash: 'hash', result: { code: 12103 } });
  await expect(publisher.publish(event)).rejects.toThrow('rejected');
});

test('inclusion uses actual block membership and timestamp, without waiting for finality', async () => {
  const { ain, publisher } = setup();
  const submission = { path: publisher.path('start'), txHash: 'hash', submittedAt: 100 };
  ain.getTransactionByHash.mockResolvedValue({ number: 2, is_finalized: false, finalized_at: 900 });
  ain.getBlockByNumber.mockResolvedValue({ number: 2, hash: 'block', timestamp: 125, transactions: [{ hash: 'hash' }] });
  expect(await publisher.inclusion(submission)).toMatchObject({ latencyMs: 25, includedAt: 125, finalized: false });
  ain.getBlockByNumber.mockResolvedValue({ number: 2, timestamp: 125, transactions: [] });
  expect(await publisher.inclusion(submission)).toBeNull();
  ain.getTransactionByHash.mockResolvedValue(null);
  expect(await publisher.inclusion(submission)).toBeNull();
});

test('negative latency is a clock error, not a zero-latency success', async () => {
  const { ain, publisher } = setup();
  ain.getTransactionByHash.mockResolvedValue({ number: 2 });
  ain.getBlockByNumber.mockResolvedValue({ number: 2, timestamp: 99, transactions: [{ hash: 'hash' }] });
  await expect(publisher.inclusion({ path: publisher.path('start'), txHash: 'hash', submittedAt: 100 })).rejects.toThrow('clocks');
});
