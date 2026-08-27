import type { Readable, Writable } from 'node:stream';

const RESPONSE_TIMEOUT_MS = 20_000;

type Pending = {
  method: string;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type CdpReply = { id?: number; error?: { message?: string }; result?: unknown };

export class CdpPipe {
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private buffer = '';
  private closed = false;

  constructor(
    private writePipe: Writable,
    private readPipe: Readable,
    private timeoutMs = RESPONSE_TIMEOUT_MS,
  ) {
    readPipe.on('data', this.onData);
    readPipe.once('end', this.onClose);
    readPipe.once('close', this.onClose);
    readPipe.once('error', this.onError);
    writePipe.once('error', this.onError);
  }

  send(method: string, params: unknown): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error('CDP pipe is closed'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command ${method} timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      this.pending.set(id, { method, resolve, reject, timer });
      this.writePipe.write(`${JSON.stringify({ id, method, params })}\0`);
    });
  }

  dispose(): void {
    this.finish(new Error('CDP pipe disposed'));
  }

  private onData = (chunk: Buffer): void => {
    this.buffer += chunk.toString('utf8');
    let separator = this.buffer.indexOf('\0');
    while (separator !== -1) {
      const raw = this.buffer.slice(0, separator);
      this.buffer = this.buffer.slice(separator + 1);
      this.dispatch(raw);
      separator = this.buffer.indexOf('\0');
    }
  };

  private dispatch(raw: string): void {
    let reply: CdpReply;
    try { reply = JSON.parse(raw) as CdpReply; } catch { return; }
    if (typeof reply.id !== 'number') return;
    const pending = this.pending.get(reply.id);
    if (!pending) return;
    this.pending.delete(reply.id);
    clearTimeout(pending.timer);
    if (reply.error) pending.reject(new Error(reply.error.message ?? `CDP command ${pending.method} failed`));
    else pending.resolve(reply.result);
  }

  private onClose = (): void => { this.finish(new Error('CDP pipe closed')); };
  private onError = (error: Error): void => { this.finish(error); };

  private finish(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    this.readPipe.off('data', this.onData);
    this.readPipe.off('end', this.onClose);
    this.readPipe.off('close', this.onClose);
    this.readPipe.off('error', this.onError);
    this.writePipe.off('error', this.onError);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
