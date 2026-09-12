import { createHash } from 'crypto';
import { createReadStream, promises as files } from 'fs';
import { PaymentReceipt } from './index';

export interface JournalEntry { channelId: string; receipt: PaymentReceipt; }
export interface JournalOptions { maxBatchRecords?: number; maxDelayMs?: number; maxPendingRecords?: number; }
export interface JournalSink {
  write(buffer: Buffer, offset: number, length: number, position: null): Promise<{ bytesWritten: number }>;
  sync(): Promise<void>;
  close(): Promise<void>;
}
const digest = (bytes: string) => createHash('sha256').update(bytes).digest('hex');

export class GroupCommitJournal {
  private readonly maximum: number;
  private readonly delay: number;
  private readonly capacity: number;
  private pending: { entry: JournalEntry; resolve: () => void; reject: (error: Error) => void }[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private fault: Error | null = null;
  private closed = false;
  readonly metrics = { entries: 0, batches: 0, bytes: 0, syncMs: 0, peakBatch: 0 };

  constructor(private readonly sink: JournalSink, options: JournalOptions = {}) {
    this.maximum = options.maxBatchRecords ?? 64;
    this.delay = options.maxDelayMs ?? 2;
    this.capacity = options.maxPendingRecords ?? 8192;
    if (!Number.isInteger(this.maximum) || this.maximum < 1 || this.maximum > 1024
      || !Number.isInteger(this.capacity) || this.capacity < this.maximum || this.capacity > 100000
      || !Number.isFinite(this.delay) || this.delay < 0 || this.delay > 1000) throw new Error('invalid journal limits');
  }

  static async create(filename: string, options: JournalOptions = {}): Promise<GroupCommitJournal> {
    const sink = await files.open(filename, 'ax', 0o600);
    try {
      const journal = new GroupCommitJournal(sink, options);
      const directory = await files.open(require('path').dirname(filename), 'r');
      try { await directory.sync(); } finally { await directory.close(); }
      return journal;
    } catch (error) { await sink.close(); throw error; }
  }

  append(entry: JournalEntry): Promise<void> {
    if (this.closed || this.fault) return Promise.reject(this.fault ?? new Error('journal closed'));
    if (this.pending.length >= this.capacity) return Promise.reject(new Error('journal backpressure limit'));
    const copy: JournalEntry = JSON.parse(JSON.stringify(entry));
    return new Promise((resolve, reject) => {
      this.pending.push({ entry: copy, resolve, reject });
      this.schedule();
    });
  }

  private schedule(): void {
    if (this.running || this.timer || !this.pending.length) return;
    this.timer = setTimeout(() => { this.timer = null; void this.flush().catch(() => undefined); }, this.pending.length >= this.maximum ? 0 : this.delay);
  }

  async flush(): Promise<void> {
    if (this.running) return this.running;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.fault) throw this.fault;
    const batch = this.pending.splice(0, this.maximum);
    if (!batch.length) return;
    this.running = (async () => {
      try {
        const entries = batch.map(item => item.entry);
        const encoded = JSON.stringify(entries);
        const bytes = Buffer.from(JSON.stringify({ version: 1, entries, sha256: digest(encoded) }) + '\n');
        let offset = 0;
        while (offset < bytes.length) {
          const written = await this.sink.write(bytes, offset, bytes.length - offset, null);
          if (!Number.isInteger(written.bytesWritten) || written.bytesWritten <= 0 || written.bytesWritten > bytes.length - offset) throw new Error('incomplete journal write');
          offset += written.bytesWritten;
        }
        const started = process.hrtime.bigint();
        await this.sink.sync();
        this.metrics.syncMs += Number(process.hrtime.bigint() - started) / 1e6;
        this.metrics.entries += batch.length;
        this.metrics.batches++;
        this.metrics.bytes += bytes.length;
        this.metrics.peakBatch = Math.max(this.metrics.peakBatch, batch.length);
        for (const item of batch) item.resolve();
      } catch (error) {
        this.fault = error instanceof Error ? error : new Error(String(error));
        for (const item of [...batch, ...this.pending.splice(0)]) item.reject(this.fault);
        throw this.fault;
      } finally { this.running = null; if (!this.closed) this.schedule(); }
    })();
    return this.running;
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    try {
      while (this.running || this.pending.length) await this.flush();
      if (this.fault) throw this.fault;
    } finally { await this.sink.close(); }
  }
}

export async function replayGroupJournal(filename: string, apply: (entry: JournalEntry) => void): Promise<{ entries: number; batches: number; validBytes: number; incompleteTailBytes: number }> {
  let remainder = Buffer.alloc(0);
  const result = { entries: 0, batches: 0, validBytes: 0, incompleteTailBytes: 0 };
  for await (const chunk of createReadStream(filename)) {
    remainder = Buffer.concat([remainder, Buffer.from(chunk)]);
    let newline: number;
    while ((newline = remainder.indexOf(10)) >= 0) {
      const line = remainder.subarray(0, newline);
      if (line.length > 16 * 1024 ** 2) throw new Error('journal frame exceeds limit');
      const frame = JSON.parse(line.toString('utf8'));
      if (frame.version !== 1 || !Array.isArray(frame.entries) || frame.entries.length < 1 || frame.entries.length > 1024
        || frame.sha256 !== digest(JSON.stringify(frame.entries))) throw new Error('invalid journal frame');
      for (const entry of frame.entries) {
        if (typeof entry.channelId !== 'string' || !entry.channelId || !entry.receipt) throw new Error('invalid journal entry');
        apply(entry);
        result.entries++;
      }
      result.batches++;
      result.validBytes += newline + 1;
      remainder = remainder.subarray(newline + 1);
    }
    if (remainder.length > 16 * 1024 ** 2) throw new Error('journal frame exceeds limit');
  }
  result.incompleteTailBytes = remainder.length;
  return result;
}
