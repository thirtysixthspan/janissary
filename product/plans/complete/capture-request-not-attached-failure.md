# Report a failure for a capture request sent while the channel is not attached

Complexity 6/10 - three small well-scoped files change, each following a pattern the surrounding code already uses for a different frame type.

`RemoteChannel.send()`'s not-attached branch already answers `filesystem-request` with an
error reply and `acp-open`/`acp-prompt` with `onError`, but has no arm for
`capture-request`: that frame is silently dropped, and `CaptureRequestTracker` never learns
its promise should settle, so the tab that called `harness capture` waits forever. Separately,
`resolveOpenRemoteCapture` in `src/harness/subcommands.ts` calls
`channel.requestCapture(id, channel.sessionId ?? '')` - an empty-string session fails
`decodeCaptureRequest`'s regex check on the far side, which answers with
`refuse()` rather than ever reaching the tracker at all.

Widen `CaptureResult` to `{ text: string; capturedAt: number } | { error: string } | undefined`.
Add a `fail(request: string, message: string): void` method to `CaptureRequestTracker` that
resolves the one pending entry keyed by that `request` id with `{ error: message }` and removes
it from `pending`, mirroring `resolve()`'s lookup-and-delete shape but resolving with an error
instead of decoding a reply frame.

In `src/remote/channel.ts`, in `send()`'s not-attached branch, add an `else if
(frame.type === 'capture-request')` arm calling `this.captures.fail(frame.request,
'Remote connection unavailable.')`.

In `src/harness/subcommands.ts`, in `resolveOpenRemoteCapture`, after the existing
`reconnectingOf`/`get` checks, add a guard returning the reconnecting error when
`channel.sessionId` is falsy, before calling `requestCapture`.

Steps: widen `CaptureResult` and add `fail()`; add the `capture-request` arm to `channel.ts`;
add the `sessionId` guard to `subcommands.ts`; run check-diff after each step.

New tests: `channel-capture.test.ts` a case asserting `fail()` resolves the matching pending
request and leaves an unrelated one untouched; `channel.test.ts` a case asserting a
`capture-request` sent while authenticating resolves with an error rather than hanging;
`subcommands.test.ts` a case where `channel.sessionId` is undefined and the reconnecting
error is reported synchronously without calling `requestCapture`.

Not touched: the wording of the reconnecting-vs-not-attached error text; the harness spec
correction (a separate backlog entry covers that); anything server-side in
`decodeCaptureRequest` or `RemoteServer.dispatch`.
