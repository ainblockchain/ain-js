import { KeyObject } from 'crypto';
import { createServer, request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { PaymentChannel, PaymentProposal, PaymentReceipt } from './index';

export function createPaymentPeer(channel: PaymentChannel, receiverKey: KeyObject,
  persist: (receipt: PaymentReceipt) => Promise<void>) {
  let faulted = false;
  let pending = Promise.resolve();
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', chunk => {
      size += chunk.length;
      if (size > 32768) { request.destroy(); return; }
      chunks.push(chunk);
    });
    request.on('error', () => undefined);
    request.on('end', () => {
      pending = pending.then(async () => {
        response.setHeader('content-type', 'application/json');
        if (faulted) { response.writeHead(503); response.end(JSON.stringify({ error: 'receipt persistence failed; recovery required' })); return; }
        if (request.method === 'GET' && request.url === '/state') { response.end(JSON.stringify(channel.snapshot())); return; }
        if (request.method !== 'POST' || request.url !== '/pay') { response.writeHead(404); response.end('{}'); return; }
        try {
          const proposal: PaymentProposal = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          const before = channel.snapshot().sequence;
          const receipt = channel.accept(proposal, receiverKey);
          if (receipt.state.sequence !== before) {
            try { await persist(receipt); } catch (error) { faulted = true; throw error; }
          }
          response.end(JSON.stringify(receipt));
        } catch (error) {
          response.writeHead(faulted ? 503 : 400);
          response.end(JSON.stringify({ error: (error as Error).message }));
        }
      }).catch(() => { faulted = true; response.destroy(); });
    });
  });
  server.setTimeout(10000);
  return server;
}

export function postPayment(endpoint: string, proposal: PaymentProposal, timeoutMs = 10000): Promise<PaymentReceipt> {
  return new Promise((resolve, reject) => {
    const url = new URL('/pay', endpoint);
    if (!['http:', 'https:'].includes(url.protocol)) return reject(new Error('HTTP or HTTPS endpoint required'));
    const body = Buffer.from(JSON.stringify(proposal));
    if (body.length > 32768) return reject(new Error('proposal exceeds size limit'));
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const request = send(url.toString(), { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': body.length } }, response => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 32768) { response.destroy(new Error('response exceeds size limit')); return; }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        try {
          const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (response.statusCode !== 200) throw new Error(`peer HTTP ${response.statusCode}: ${result.error || 'rejected'}`);
          resolve(result);
        } catch (error) { reject(error); }
      });
    });
    request.on('error', reject);
    request.setTimeout(timeoutMs, () => request.destroy(new Error('payment observation timed out; retry the same proposal')));
    request.end(body);
  });
}
