import type { ClientFrame, ServerFrame } from '../protocol.js';

export type CaptureResult = { text: string; capturedAt: number } | { error: string } | undefined;

type CaptureRequestFrame = Extract<ClientFrame, { type: 'capture-request' }>;
type CaptureReplyFrame = Extract<ServerFrame, { type: 'capture-reply' }>;

// The request/reply bookkeeping behind `RemoteChannel.requestCapture()`: a spawn id can have at most
// one outstanding query, correlated by that id alone (the wire carries no separate request id — see
// `capture-request`/`capture-reply` in `./protocol.js`). Split out of `RemoteChannel` to keep it a
// small, independently testable piece rather than inline state on an already-large class.
export class CaptureRequestTracker {
  private pending = new Map<string, (result: CaptureResult) => void>();
  private nextRequest = 0;

  request(id: string, session: string, send: (frame: CaptureRequestFrame) => void, origin?: string): Promise<CaptureResult> {
    return new Promise((resolve) => {
      const request = String(++this.nextRequest);
      this.pending.set(request, resolve);
      send({ type: 'capture-request', session, id, request, ...(origin !== undefined && { origin }) });
    });
  }

  resolve(frame: CaptureReplyFrame): void {
    const resolve = this.pending.get(frame.request);
    this.pending.delete(frame.request);
    resolve?.(frame.text !== undefined && frame.capturedAt !== undefined ? { text: frame.text, capturedAt: frame.capturedAt } : undefined);
  }

  // A channel that closes before a reply arrives must not leave a caller awaiting one forever.
  settleAll(): void {
    for (const resolve of this.pending.values()) resolve(undefined);
    this.pending.clear();
  }

  // A request that could not be sent at all — the channel is not attached — settles with a
  // reason instead of being dropped, so the caller can report it rather than wait forever.
  fail(request: string, message: string): void {
    const resolve = this.pending.get(request);
    this.pending.delete(request);
    resolve?.({ error: message });
  }
}
