# Bound the capturedAt timestamp on gate-event and capture-reply frames

Complexity 3/10 - a bounds check added to two existing decoders in one file, following the
exact pattern `positiveInteger` already uses in `frame-decode.ts` for `cols`/`rows`. No new
architecture, no behavior change for any currently-valid frame.

`decodeGateEvent` and `decodeCaptureReply` in `src/remote/frame-decode-detect.ts` accept any
finite number for `capturedAt`. Both values flow into `writeCaptureFile` and on to
`harnessArtifactFilename`, which calls `new Date(timestamp).toISOString()` — a call that
throws `RangeError` for any magnitude above the `Date` range (`Math.abs(timestamp) >
8.64e15`) — synchronously inside `RemoteChannel.receive()`'s inbound data path. A peer that
sends an out-of-range or non-integer `capturedAt` can crash the local process from one frame.

Add a local `validCapturedAt(value: unknown): value is number` predicate to
`frame-decode-detect.ts` — `typeof value === 'number' && Number.isSafeInteger(value) &&
Math.abs(value) <= 8.64e15` — and use it in place of the current `typeof capturedAt !==
'number' || !Number.isFinite(capturedAt)` checks in both `decodeGateEvent` and
`decodeCaptureReply`, returning `malformed(...)` otherwise, same as every other check in
both functions already does.

`requestParkedCapture` in `src/remote/serve-detach-query.ts` reads `frame.capturedAt` off a
value already produced by `decodeCaptureReply` (confirm this at implementation time), so it
inherits the new bound for free. `encodeCaptureReply` in `src/remote/serve-detach-capture.ts`
only ever forwards a `capturedAt` that originated from a local `ScreenCapture.capturedAt`
(`Date.now()`-derived), so it cannot originate an out-of-range value; no change needed there.
`harnessArtifactFilename` itself is not touched — every other caller passes a locally
generated timestamp, and its existing sanitization is correct for them.

Steps: add `validCapturedAt` to `frame-decode-detect.ts`; use it in `decodeGateEvent` and
`decodeCaptureReply`; confirm `serve-detach-query.ts`'s read site needs no change; run
check-diff after each step.

New tests: add to the malformed-frame table in `src/remote/protocol.test.ts` beside the
existing `gate-event without a capturedAt` entry — a non-integer `capturedAt` (e.g. `1.5`)
and an out-of-Date-range value (e.g. `1e16`) for both `gate-event` and `capture-reply`. The
round-trip (accepted-shape) cases already in that file, and the existing malformed cases
for both frame types, must keep passing unchanged.

Not touched: `harnessArtifactFilename` and its callers; `encodeCaptureReply`'s shape; any
frame type outside this pair.
