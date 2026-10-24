import type { ClientFrame, ServerFrame } from '../protocol-frames.js';
import { PendingRequests } from './pending-requests.js';

export type CaptureResult = { text: string; capturedAt: number } | { error: string } | undefined;

type CaptureRequestFrame = Extract<ClientFrame, { type: 'capture-request' }>;
type CaptureReplyFrame = Extract<ServerFrame, { type: 'capture-reply' }>;

// How long a far side has to answer one capture query. It answers from its own detection pipeline
// with no work to do, so a reply that has not come by then is not coming, and `harness capture`
// says so instead of waiting on a channel that may never close. The same bound the parked path
// (`DETACHED_CAPTURE_TIMEOUT_MS`) puts on its own query.
export const CAPTURE_REPLY_TIMEOUT_MS = 15_000;

// The request/reply bookkeeping behind `RemoteChannel.requestCapture()`. Each query gets its own
// request id, which the `capture-reply` echoes, so two overlapping queries for one spawn id settle
// independently (see `capture-request`/`capture-reply` in `../protocol-frames.ts`). Split out of
// `RemoteChannel` to keep it a small, independently testable piece rather than inline state on an
// already-large class.
export class CaptureRequestTracker {
  private pending = new PendingRequests<CaptureResult>();
  private nextRequest = 0;

  request(id: string, session: string, send: (frame: CaptureRequestFrame) => void, origin?: string): Promise<CaptureResult> {
    const request = String(++this.nextRequest);
    const result = this.pending.open(request, {
      deadlineMs: CAPTURE_REPLY_TIMEOUT_MS,
      onTimeout: (timedOut) => { this.pending.settle(timedOut, { error: 'Remote capture query timed out.' }); },
    });
    send({ type: 'capture-request', session, id, request, ...(origin !== undefined && { origin }) });
    return result;
  }

  resolve(frame: CaptureReplyFrame): void {
    this.pending.settle(frame.request,
      frame.text !== undefined && frame.capturedAt !== undefined ? { text: frame.text, capturedAt: frame.capturedAt } : undefined);
  }

  // A channel that closes before a reply arrives must not leave a caller awaiting one forever.
  settleAll(): void {
    this.pending.settleAll(() => ({ value: undefined }));
  }

  // A request that could not be sent at all — the channel is not attached — settles with a
  // reason instead of being dropped, so the caller can report it rather than wait forever.
  fail(request: string, message: string): void {
    this.pending.settle(request, { error: message });
  }
}
