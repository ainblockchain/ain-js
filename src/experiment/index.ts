import type Ain from '../ain';
import { KpiEvent, parseKpiEvent, validIdentifier } from './events';

export { KpiEvent, parseKpiEvent } from './events';

export interface ExperimentSubmission {
  path: string;
  txHash: string;
  submittedAt: number;
}

export class ExperimentPublisher {
  constructor(private readonly ain: Ain, public readonly runId: string, public readonly app = 'ainize_kpi') {
    if (!validIdentifier(runId) || !validIdentifier(app)) throw new Error('Invalid experiment app or run ID');
    if (ain.rawResultMode) throw new Error('ExperimentPublisher requires rawResultMode=false');
  }

  path(eventId: string): string {
    if (!validIdentifier(eventId)) throw new Error('Invalid event ID');
    return `/apps/${this.app}/runs/${this.runId}/events/${eventId}`;
  }

  async publish(input: KpiEvent): Promise<ExperimentSubmission> {
    const event = parseKpiEvent(input);
    if (event.runId !== this.runId) throw new Error('Event run ID mismatch');
    const path = this.path(event.id);
    const reference = this.ain.db.ref(path);
    if (await reference.getValue() !== null) throw new Error('Event path already exists; do not overwrite evidence');
    const submittedAt = Date.now();
    const result = await reference.setValue({ value: event, nonce: -1, timestamp: submittedAt });
    if (!result || typeof result.tx_hash !== 'string' || result.result?.code !== 0) {
      throw new Error('Experiment transaction rejected or missing transaction hash');
    }
    return { path, txHash: result.tx_hash, submittedAt };
  }

  async inclusion(submission: ExperimentSubmission) {
    if (!submission.path.startsWith(`/apps/${this.app}/runs/${this.runId}/events/`)) throw new Error('Submission path mismatch');
    const info = await this.ain.getTransactionByHash(submission.txHash);
    if (!info || info.number === undefined || info.number < 0) return null;
    const block = await this.ain.getBlockByNumber(info.number, true);
    if (!block || !block.transactions.some(transaction => transaction.hash === submission.txHash)) return null;
    if (!Number.isSafeInteger(block.timestamp) || block.timestamp < submission.submittedAt) {
      throw new Error('Invalid block timestamp or unsynchronized clocks');
    }
    return { ...submission, includedAt: block.timestamp, blockNumber: block.number, blockHash: block.hash,
      latencyMs: block.timestamp - submission.submittedAt, finalized: info.is_finalized === true };
  }
}
