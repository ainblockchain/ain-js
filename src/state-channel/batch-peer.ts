import { KeyObject } from 'crypto';
import { createServer, request as httpRequest } from 'http';
import { PaymentChannel, PaymentProposal, PaymentReceipt } from './index';

export interface BatchChannel { channel: PaymentChannel; key: KeyObject; }
export interface BatchProposal { channelId: string; proposal: PaymentProposal; }
interface BatchResult { channelId: string; receipt?: PaymentReceipt; error?: string; }
const maxBytes = 4 * 1024 ** 2;

export function createBatchPaymentPeer(channels: Map<string, BatchChannel>, persist: (channelId: string, receipt: PaymentReceipt) => Promise<void>) {
  const pending = new Map<string, Promise<void>>();
  const faulted = new Set<string>();
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', chunk => { size += chunk.length; if (size > maxBytes) request.destroy(); else chunks.push(chunk); });
    request.on('error', () => undefined);
    request.on('end', async () => {
      try {
        const route = new URL(request.url ?? '/', 'http://localhost');
        if (request.method === 'GET' && route.pathname === '/state') {
          const channelId = route.searchParams.get('channelId') ?? '';
          if (!channels.has(channelId)) throw new Error('unknown channel');
          await pending.get(channelId);
          if (faulted.has(channelId)) throw new Error('channel persistence failed; recovery required');
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify(channels.get(channelId)!.channel.snapshot()));
          return;
        }
        if (size > maxBytes || request.method !== 'POST' || request.url !== '/pay-batch') throw new Error('invalid batch request');
        const items: BatchProposal[] = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!Array.isArray(items) || items.length < 1 || items.length > 128
          || items.some(item => !item || typeof item.channelId !== 'string' || !channels.has(item.channelId))
          || new Set(items.map(item => item.channelId)).size !== items.length) throw new Error('invalid or duplicate batch channel');
        const results = await Promise.all(items.map(item => new Promise<BatchResult>(resolve => {
          const previous = pending.get(item.channelId) ?? Promise.resolve();
          const operation = previous.then(async () => {
            try {
              if (faulted.has(item.channelId)) throw new Error('channel persistence failed; recovery required');
              const context = channels.get(item.channelId)!;
              const before = context.channel.snapshot().sequence;
              const receipt = context.channel.accept(item.proposal, context.key);
              if (receipt.state.sequence !== before) {
                try { await persist(item.channelId, receipt); }
                catch (error) { faulted.add(item.channelId); throw error; }
              }
              resolve({ channelId: item.channelId, receipt });
            } catch (error) { resolve({ channelId: item.channelId, error: (error as Error).message }); }
          });
          pending.set(item.channelId, operation);
        })));
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify(results));
      } catch (error) { response.writeHead(400); response.end(JSON.stringify({ error: (error as Error).message })); }
    });
  });
  server.setTimeout(15000);
  return server;
}

export class PaymentBatchClient {
  private pending: { item: BatchProposal; resolve: (receipt: PaymentReceipt) => void; reject: (error: Error) => void }[] = [];
  private scheduled = false;

  constructor(private readonly endpoint: string, private readonly batchSize = 32) {
    const url = new URL(endpoint);
    if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password) throw new Error('batch diagnostic requires a loopback HTTP peer');
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 128) throw new Error('invalid transport batch size');
  }

  submit(item: BatchProposal): Promise<PaymentReceipt> {
    if (this.pending.length >= 8192) return Promise.reject(new Error('batch client backpressure'));
    return new Promise((resolve, reject) => {
      this.pending.push({ item: JSON.parse(JSON.stringify(item)), resolve, reject });
      if (!this.scheduled) { this.scheduled = true; setImmediate(() => this.flush()); }
    });
  }

  private flush(): void {
    this.scheduled = false;
    const batch = this.pending.splice(0, this.batchSize);
    if (!batch.length) return;
    if (this.pending.length) { this.scheduled = true; setImmediate(() => this.flush()); }
    const body = Buffer.from(JSON.stringify(batch.map(entry => entry.item)));
    if (body.length > maxBytes) { for (const entry of batch) entry.reject(new Error('batch exceeds size limit')); return; }
    const request = httpRequest(new URL('/pay-batch', this.endpoint).toString(), { method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': body.length } }, response => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', chunk => { size += chunk.length; if (size > maxBytes) response.destroy(new Error('batch response exceeds limit')); else chunks.push(chunk); });
      response.on('error', error => { for (const entry of batch) entry.reject(error); });
      response.on('end', () => {
        try {
          if (response.statusCode !== 200) throw new Error(`batch peer HTTP ${response.statusCode}`);
          const results: BatchResult[] = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (!Array.isArray(results) || results.length !== batch.length || results.some((result, index) => result.channelId !== batch[index].item.channelId)) throw new Error('batch receipt identities differ');
          for (let index = 0; index < batch.length; index++) {
            const result = results[index];
            if (result.error || !result.receipt) batch[index].reject(new Error(result.error ?? 'missing receipt'));
            else batch[index].resolve(result.receipt);
          }
        } catch (error) { for (const entry of batch) entry.reject(error as Error); }
      });
    });
    request.on('error', error => { for (const entry of batch) entry.reject(error); });
    request.setTimeout(15000, () => request.destroy(new Error('batch observation expired; retain the same proposals')));
    request.end(body);
  }
}
