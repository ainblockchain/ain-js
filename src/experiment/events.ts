export type KpiEvent = {
  version: 1;
  id: string;
  runId: string;
  nodeId: string;
  observedAt: number;
} & (
  | { kind: 'training'; jobId: string; datasetId: string; state: 'queued' | 'running' | 'completed' | 'failed'; startedAt?: number; endedAt?: number; path: string; txHash?: string }
  | { kind: 'transaction'; jobId: string; path: string; txHash: string; submittedAt: number; state: 'submitted' | 'included' | 'failed'; includedAt?: number; blockNumber?: number; blockHash?: string }
  | { kind: 'throughput'; metric: 2 | 4; state: 'running' | 'final'; scope: 'l2-acknowledged' | 'ainize-inference'; startedAt: number; endedAt: number; succeeded: number; failed: number; users?: number; workers?: number }
  | { kind: 'model'; modelId: string; revision: string; runtime: string; state: 'succeeded' | 'failed'; actualModelId?: string; responseValid: boolean }
  | { kind: 'dataset'; sourceId: string; revision: string; config: string; split: string; datasetId: string; rows: number; truncated: boolean; state: 'succeeded' | 'failed' }
);

export function validIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 2048;
}

function count(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function timestamp(value: unknown): value is number {
  return count(value) && value > 0;
}

export function parseKpiEvent(input: unknown): KpiEvent {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('event must be an object');
  const event = input as Record<string, unknown>;
  if (event.version !== 1 || !validIdentifier(event.id) || !validIdentifier(event.runId)
    || !text(event.nodeId) || !timestamp(event.observedAt)) throw new Error('invalid event identity');
  let valid = false;
  switch (event.kind) {
    case 'training':
      valid = text(event.jobId) && text(event.datasetId) && text(event.path)
        && ['queued', 'running', 'completed', 'failed'].includes(String(event.state))
        && (event.txHash === undefined || text(event.txHash))
        && (event.startedAt === undefined || timestamp(event.startedAt))
        && (event.endedAt === undefined || timestamp(event.endedAt))
        && (event.state !== 'running' && event.state !== 'completed' || timestamp(event.startedAt))
        && (event.state !== 'completed' || timestamp(event.endedAt))
        && (event.state !== 'failed' || event.startedAt === undefined || timestamp(event.endedAt))
        && (event.endedAt === undefined || event.startedAt === undefined || Number(event.endedAt) >= Number(event.startedAt));
      break;
    case 'transaction':
      valid = text(event.jobId) && text(event.path) && text(event.txHash) && timestamp(event.submittedAt)
        && ['submitted', 'included', 'failed'].includes(String(event.state))
        && (event.state !== 'included' || timestamp(event.includedAt) && Number(event.includedAt) >= Number(event.submittedAt)
          && count(event.blockNumber) && text(event.blockHash));
      break;
    case 'throughput':
      valid = (event.metric === 2 && event.scope === 'l2-acknowledged' || event.metric === 4 && event.scope === 'ainize-inference')
        && ['running', 'final'].includes(String(event.state))
        && timestamp(event.startedAt) && timestamp(event.endedAt) && event.endedAt > event.startedAt
        && count(event.succeeded) && count(event.failed)
        && (event.metric !== 4 || count(event.users) && count(event.workers));
      break;
    case 'model':
      valid = text(event.modelId) && text(event.revision) && text(event.runtime)
        && ['succeeded', 'failed'].includes(String(event.state)) && typeof event.responseValid === 'boolean'
        && (event.state !== 'succeeded' || event.responseValid === true && event.actualModelId === event.modelId);
      break;
    case 'dataset':
      valid = text(event.sourceId) && text(event.revision) && text(event.config) && text(event.split)
        && text(event.datasetId) && count(event.rows) && typeof event.truncated === 'boolean'
        && ['succeeded', 'failed'].includes(String(event.state))
        && (event.state !== 'succeeded' || event.rows > 0 && event.truncated === false);
      break;
  }
  if (!valid) throw new Error(`invalid ${String(event.kind)} event`);
  const fields: Record<string, string[]> = {
    training: ['jobId', 'datasetId', 'state', 'startedAt', 'endedAt', 'path', 'txHash'],
    transaction: ['jobId', 'path', 'txHash', 'submittedAt', 'state', 'includedAt', 'blockNumber', 'blockHash'],
    throughput: ['metric', 'state', 'scope', 'startedAt', 'endedAt', 'succeeded', 'failed', 'users', 'workers'],
    model: ['modelId', 'revision', 'runtime', 'state', 'actualModelId', 'responseValid'],
    dataset: ['sourceId', 'revision', 'config', 'split', 'datasetId', 'rows', 'truncated', 'state'],
  };
  const allowed = new Set(['version', 'id', 'runId', 'nodeId', 'observedAt', 'kind', ...fields[String(event.kind)]]);
  if (Object.keys(event).some(key => !allowed.has(key))) throw new Error('unknown event field');
  return event as KpiEvent;
}
