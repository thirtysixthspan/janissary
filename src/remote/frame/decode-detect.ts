import { malformed, nonEmptyString, type DecodeResult } from './decode-shared.js';
import { decodeOrigin } from './decode-root.js';

// The decoders for the version-18 detection family — `capture-request`/`capture-reply` and
// `gate-event`/`busy-transition` — in their own module for the same reason `frame-decode-history.ts`
// has one: `frame-decode.ts` is the dispatcher, and four frame shapes are more validation than a
// dispatcher arm should hold.

// `new Date(timestamp).toISOString()`, which `harnessArtifactFilename` calls on every capturedAt
// this family carries, throws RangeError outside this range — a peer-supplied value must be bounded
// before it reaches that call rather than merely finite.
function validCapturedAt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) <= 8.64e15;
}

export function decodeCaptureRequest(record: Record<string, unknown>): DecodeResult {
  const { session, id, request } = record;
  const origin = decodeOrigin(record.origin);
  if (typeof session !== 'string' || !/^[a-f\d-]{36}$/.test(session) || !nonEmptyString(id) || !nonEmptyString(request)
    || origin === false) {
    return malformed('capture-request');
  }
  return { type: 'capture-request', session, id, request, ...(origin !== undefined && { origin }) };
}

export function decodeCaptureReply(record: Record<string, unknown>): DecodeResult {
  const { id, request, text, capturedAt } = record;
  if (!nonEmptyString(id) || !nonEmptyString(request)) return malformed('capture-reply');
  if (text === undefined && capturedAt === undefined) return { type: 'capture-reply', id, request };
  if (typeof text !== 'string' || !validCapturedAt(capturedAt)) {
    return malformed('capture-reply');
  }
  return { type: 'capture-reply', id, request, text: Buffer.from(text, 'base64').toString('utf8'), capturedAt };
}

export function decodeGateEvent(record: Record<string, unknown>): DecodeResult {
  const { id, message, capturedAt, capture } = record;
  if (!nonEmptyString(id) || !nonEmptyString(message)
    || !validCapturedAt(capturedAt)
    || !(capture === undefined || typeof capture === 'string')) return malformed('gate-event');
  return {
    type: 'gate-event', id, message, capturedAt,
    ...(capture !== undefined && { capture: Buffer.from(capture, 'base64').toString('utf8') }),
  };
}

export function decodeBusyTransition(record: Record<string, unknown>): DecodeResult {
  const { id, busy, unread } = record;
  if (!nonEmptyString(id) || typeof busy !== 'boolean' || typeof unread !== 'boolean') return malformed('busy-transition');
  return { type: 'busy-transition', id, busy, unread };
}
