import { decodeFrame, encodeFrame, type ServerFrame } from './protocol.js';

export type PreAttachFrame =
  | { kind: 'attach'; restore?: boolean }
  | { kind: 'capture-request'; id: string }
  | { kind: 'refuse' };

// What `DetachedPeer.accept()`'s pre-attach branch recognizes before a connection is treated as
// attached: the existing `attach` frame, and the new non-attaching `capture-request` query (decision
// 16 of the auto-accept-while-detached plan) that lets `harness capture <name>` ask a parked peer for
// a fresh snapshot without claiming its socket or touching its expiry timer.
export function classifyPreAttachFrame(line: string, session: string): PreAttachFrame {
  const frame = decodeFrame(line);
  if (!('type' in frame)) return { kind: 'refuse' };
  if (frame.type === 'attach' && frame.session === session) {
    return { kind: 'attach', ...(frame.restore !== undefined && { restore: frame.restore }) };
  }
  if (frame.type === 'capture-request' && frame.session === session) return { kind: 'capture-request', id: frame.id };
  return { kind: 'refuse' };
}

export function encodeCaptureReply(id: string, capture: { text: string; capturedAt: number } | undefined): string {
  return `${encodeFrame({ type: 'capture-reply', id, ...(capture && { text: capture.text, capturedAt: capture.capturedAt }) })}\n`;
}

// One `busy-transition` per still-live harness process, reflecting the far side's retained current
// classification rather than any queued history — see decision 20 of the auto-accept-while-detached
// plan: busy/ready is a "current state" snapshot, not a log, so an attach gets exactly one frame per
// process and never a replay of the flips that happened while detached.
export function busyTransitionFrames(states: Iterable<{ id: string; busy: boolean }>): ServerFrame[] {
  return [...states].map(({ id, busy }) => ({ type: 'busy-transition', id, busy, unread: false }));
}
