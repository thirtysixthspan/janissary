import type { ServerFrame } from './protocol.js';

export type CaptureResult = { text: string; capturedAt: number } | undefined;

type CaptureReplyFrame = Extract<ServerFrame, { type: 'capture-reply' }>;

// The request/reply bookkeeping behind `RemoteChannel.requestCapture()`: a spawn id can have at most
// one outstanding query, correlated by that id alone (the wire carries no separate request id — see
// `capture-request`/`capture-reply` in `./protocol.js`). Split out of `RemoteChannel` to keep it a
// small, independently testable piece rather than inline state on an already-large class.
export class CaptureRequestTracker {
  private pending = new Map<string, (result: CaptureResult) => void>();

  request(id: string, session: string, send: (frame: { type: 'capture-request'; session: string; id: string }) => void): Promise<CaptureResult> {
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      send({ type: 'capture-request', session, id });
    });
  }

  resolve(frame: CaptureReplyFrame): void {
    const resolve = this.pending.get(frame.id);
    this.pending.delete(frame.id);
    resolve?.(frame.text !== undefined && frame.capturedAt !== undefined ? { text: frame.text, capturedAt: frame.capturedAt } : undefined);
  }

  // A channel that closes before a reply arrives must not leave a caller awaiting one forever.
  settleAll(): void {
    for (const resolve of this.pending.values()) resolve(undefined);
    this.pending.clear();
  }
}
