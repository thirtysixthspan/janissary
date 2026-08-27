# Centralize Chrome pipe dispatch

**Complexity: 7/10** — one connection-level dispatcher replaces duplicated command readers in two modules and is instantiated at the existing Chrome startup boundary. The change needs concurrency, timeout, malformed-message, error, and close tests, but no protocol or UI redesign.

## Goal

All Chrome DevTools Protocol commands sharing the managed Chrome pipe use unique request IDs and one stream parser. Concurrent extension loading, window resizing, and bounds capture must receive only their own responses, and pipe closure must promptly reject every outstanding command.

## Approach

Create a `CdpPipe` service that owns the readable/writable streams, a monotonic request ID, the NUL-delimited receive buffer, and a pending request map with per-command timeouts. It installs one data listener and close/error listeners for the connection lifetime. `chrome-extension-loader` and `cdp-window-resize` accept that service instead of attaching their own listeners; `main.ts` creates one service for the child pipes and injects it into both features.

## Implementation steps

1. Add `src/cdp-pipe.ts` with unique-ID command dispatch, one incremental parser, timeout cleanup, malformed/event-message tolerance, and close/error rejection of all pending commands.
2. Replace the duplicated `sendCdpCommand` implementations in `src/chrome-extension-loader.ts` and `src/cdp-window-resize.ts` with calls to `CdpPipe.send`.
3. Update `src/main.ts` to create and share one `CdpPipe` for extension loading, resizing, and bounds capture, and dispose it during app teardown.
4. Update the existing Chrome loader and window-resize tests and add direct dispatcher concurrency/close coverage.
5. Record the concurrency guarantee in the embedded-page and profile specs, remove the backlog entry, and promote this plan after checks pass.

## Tests

- `src/cdp-pipe.test.ts`: concurrent commands get distinct IDs and out-of-order replies resolve the matching promise; split/multiple frames parse correctly; malformed and unrelated messages are ignored; timeout rejects and removes one request; pipe close/error rejects all pending requests.
- `src/chrome-extension-loader.test.ts`: successful load, CDP error warning, and timeout warning through an injected dispatcher.
- `src/cdp-window-resize.test.ts`: resize and bounds command sequences use increasing IDs and preserve existing errors.

## Out of scope

- Changing which CDP domains or commands Janissary uses.
- Reconnecting or relaunching Chrome after its debugging pipe closes.
- Changing profile layout semantics or extension failure wording.
- Generalizing the dispatcher to WebSocket CDP transports.
