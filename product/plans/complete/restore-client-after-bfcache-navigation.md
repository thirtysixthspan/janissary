# Restore the WebSocket client after bfcache navigation

**Complexity: 7/10** — a small client-lifecycle module, a composition-root handoff, a reconnect grace period in the server, focused client/server lifecycle tests, and behavioral spec updates. No wire-protocol changes are needed.

## Goal

Return the web app to an active, initialized WebSocket connection when a browser restores it from the back/forward cache.

## Approach

Keep `main.tsx` as the composition root, but move its page-lifecycle branching into a testable client lifecycle module. The module will dispose the current client whenever the page hides, create a replacement only when the page is restored from bfcache, and render the app with that replacement so existing client-bound effects subscribe to the new connection. Give the server a short grace period before it exits after its last client disconnects, and cancel that exit when the replacement client reconnects.

## Implementation steps

1. Add a focused `client-page-lifecycle` module that owns initial creation, pagehide disposal, and persisted-pageshow recreation and rendering.
2. Route `main.tsx` through the lifecycle module while preserving its single React root and StrictMode tree.
3. Delay last-client server shutdown briefly and cancel that pending exit when a client reconnects.
4. Add lifecycle tests covering initial creation, a persisted pagehide/pageshow cycle, a non-persisted pageshow that does not reconnect, and a reconnect that cancels server shutdown.
5. Update the CLI and WebSocket functional specs to state how the app behaves after a short client disconnect and browser history restoration.

## Tests

- `web/src/client-page-lifecycle.test.ts` proves the initial client is rendered, then disposed and replaced after a persisted history restore.
- `src/index.test.ts` proves a client reconnecting during the shutdown grace period keeps the server available.
- `./scripts/run.mjs check-diff` verifies the affected client tests, linting, and typechecking.

## Out of scope

- Adding reconnect backoff or changing the WebSocket protocol.
- Retaining transient client-only UI state across a bfcache restoration.
- Updating user documentation, which does not currently describe browser navigation or WebSocket lifecycle behavior.
