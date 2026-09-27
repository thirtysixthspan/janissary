# Keep the launch state snapshot for App when it arrives before App subscribes

**Complexity: 3/10** — a four-line change to one class, `JanusClient` in `web/src/ws.ts`, plus a regression test. The only care needed is making sure replaying a snapshot to a new subscriber is harmless for the one production subscriber (`useServerState`) and for the existing `ws.test.ts` cases.

## Bug

From `product/backlog/bugs.md` (first `## ready` entry): on launch the window sometimes opens but the UI fails to render, and the app has to be restarted. The entry's unconfirmed hypothesis for this blank-UI case is that the first state snapshot is dropped. The same entry also reports a separate symptom, the command line not holding keyboard focus after launch and a click not recovering it. The entry itself says the snapshot hypothesis does not explain that one, and this fix does not address it.

## Reproduction

`web/src/App.initial-state.test.tsx` builds a real `JanusClient` on a fake `WebSocket`, fires the socket's `open` (which sends `init`), delivers a `state` event carrying one agent tab, and only then renders `<App client={client} />`. Against the current code the test fails: App renders `<div class="app">Connecting…</div>` with no tab strip and no command line. Nothing else ever arrives, so on a real launch that is idle the window stays on "Connecting…" with no console error.

On a real launch this ordering can happen. `main.tsx` constructs the client, which opens the socket, before `root.render` is called. React's concurrent root renders in a scheduler task and runs passive effects (where `useServerState` subscribes) in a later task. The socket's `open` and the `init` reply are separate tasks that the browser may run in between.

## Root cause

The server answers `init` exactly once (`src/message/handler.ts:23`) and never resends it on its own. `JanusClient.onEvent` passes a `state` event only to the listeners registered at that moment (`web/src/ws.ts:91`) and keeps no copy. `useServerState` registers App's listener inside a `useEffect` (`web/src/useServerState.ts:43`), so an `init` reply that arrives before that effect runs is lost, and App's `tabs` stay `[]`, which renders "Connecting…".

## Correct behavior

The snapshot that answers `init` must reach App whatever the timing. App shows the server's current tabs as soon as it mounts, even when that snapshot came in before App subscribed. `product/specs/websocket-rpc.md` "State snapshots" says each update supplies the displayed tabs. The spec does not say a snapshot may be lost, and a client that stays on "Connecting…" while the session is up is clearly wrong.

## Approach

Have `JanusClient` keep the most recent state snapshot and hand it to a listener as soon as that listener subscribes. A snapshot is a complete picture of the session and the newest one supersedes every earlier one, so replaying it to a newcomer is always correct and gives a late subscriber the same state an early subscriber already has. `useServerState`'s listener is idempotent: every field goes through a setter, and the route-index bump only fires when the route changes, so a replay under StrictMode's double-invoked effect is harmless. `dispose()` clears the kept snapshot along with the listeners.

Rejected alternative: re-sending `init` from `useServerState` once it subscribes. That adds a round trip and a second full snapshot on every launch, and it leaves the same race for any later subscriber.

## Implementation steps

1. `web/src/ws.ts`: add a `latestState: StateEvent | undefined` field; in `onEvent`'s `state` case store the normalized snapshot before fanning it out; in `onState`, after adding the listener, call it with `latestState` when one exists; in `dispose()`, reset `latestState`.
2. Run `./scripts/run.mjs check-diff`.

## Regression test

- `web/src/App.initial-state.test.tsx` — "renders the tabs from the init reply instead of waiting on "Connecting…"": delivers the `init` reply before App mounts and asserts that App renders the tab strip and command line, not "Connecting…". Fails without the fix, passes with it.
- `web/src/ws.test.ts` — a unit case asserting that `onState` hands a listener that subscribes after a snapshot arrived the latest snapshot at once, and that `dispose` forgets it.

## Specs and docs

`product/specs/websocket-rpc.md` "State snapshots": add that the latest snapshot reaches the app even if it arrived before the app was ready to show it, so a launch never sits on "Connecting…" while the session is up. `help.md` and `documentation/user-documentation/` do not describe this, so nothing changes there.

## Out of scope

- The focus symptom in the same backlog entry (command line not focused after launch, and a click not recovering it). It is still unreproduced, and this fix does not claim to address it, so the backlog entry stays in place.
- Any server-side change to how `init` is answered.
