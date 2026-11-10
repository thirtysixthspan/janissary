# Split startServer into release and connection steps
**Complexity: 4/10** — ~70 added lines, 1 edited production file, 4 requirements, 4 scenarios (p=4.56).

## Goal

Make `startServer` in `src/index.ts` release its background resources (`ResumeWatch`, the resume subscription) from one place instead of three hand-copied sequences, and move the WebSocket connection handler into its own module so `startServer` shrinks. No behavior changes.

## Approach

- Add a local `stopBackground()` closure in `startServer` that stops the resume watch and unsubscribes the resume subscription. The launch-shell failure path, the listen failure path, and `close` call it.
- Move the body of `wss.on('connection', ...)` into `src/client-connection.ts` as `attachClientConnection(ws, deps)`. `deps` carries the controller, the client set, `broadcast`, `cancelExit`, `armExit`, and `isClosed`. `src/connection/` holds database-connection code, so it is not used. The upgrade guard (`originAllowed`, then `tokenMatches`) stays where it is, in that order. `isClientMessage`, `clientParamsProblem`, and `handle` are called exactly as before.
- `startServer` keeps `exitTimer` and passes `cancelExit`/`armExit` closures.

## Tests

In `src/index.test.ts`:

- launch shell fails: the error is rethrown, the controller is shut down, the resume watch is stopped, and the subscription is released.
- listen fails: the resume watch is stopped and the subscription is released alongside the existing controller shutdown check.

Existing connection tests (token-gated client, malformed envelopes, reconnect, bye on last disconnect) cover the moved handler.

## Out of scope

Changing shutdown ordering, the upgrade guard, or the client message handling.
