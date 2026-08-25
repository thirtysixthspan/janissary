# Construct `JanusClient` at the app boundary and give it a teardown

**Complexity: 6/10** — one new method and two type exports on the protocol client, one moved construction site, one new required prop, and a test file that swaps a hoisted module mock for an injected fake across forty render sites. No new architecture, no wire-protocol change, and nothing a user can observe changes.

`web/src/App.tsx:34`–`:35` builds the protocol client inside its own render body (`clientReference.current ??= new JanusClient()`), against §7's "instantiated at the edge, not imported into components" and its closing rule that components never construct services. `web/src/ws.ts:34`–`:38` opens the WebSocket and registers its `message` and `open` listeners in the constructor, and the class has no teardown anywhere — against §7's explicit-lifecycle constraint that a service acquiring a socket or a listener exposes the matching release.

The cost is already being paid in the test suite. Because the instance cannot be injected, `web/src/App.test.tsx:35` has to `vi.mock('./ws')` with a hand-written fake class, and that fake has drifted from the real service: its locally re-declared `ServerStateListener` (lines 19-24) is missing the `activeTabNameMaxLength` parameter `ws.ts:10` passes, and its `LayoutListener` (lines 27-32) accepts a `'schedules'` focus value the real one does not. The largest test file in `web/src/` therefore asserts against a shape the app no longer has, and nothing catches it — a module mock is checked against nothing.

## Goal

`JanusClient` is constructed once, in `web/src/main.tsx`, and handed to `App` as a required prop. The class exposes `dispose()` alongside the acquisition in its constructor, and `main.tsx` owns that call. `App.test.tsx` injects a fake instead of mocking the module, and the fake's listener parameters are the types `ws.ts` exports — so the next signature change to a listener is a type error in the test rather than silent drift.

## Design decisions

**A required prop, not an optional one with a constructing default.** An optional `client` prop that falls back to `new JanusClient()` would leave the violation in place and hide it behind a default. `App` takes `client: JanusClient` and has no way to make one.

**`main.tsx` owns construction *and* teardown.** §7 puts the lifecycle with whoever owns the instance. `App` is the root component, so there is no hook above it to run a cleanup — the composition root is the owner, and it releases the client on `pagehide`. `web/src/main.tsx` is already excluded from coverage in `vitest.config.ts` as the untested composition root, which is exactly why the logic put there is two statements and no branching.

**`pagehide`, not `beforeunload`.** `useUnsavedQuitGuard` already owns `beforeunload` to prompt about unsaved work; adding a second handler there would entangle teardown with a dialog that may cancel the navigation. `pagehide` fires once the page is actually going away.

**`dispose()` releases everything the client owns, not only what the socket needs.** §7 asks for one call that releases everything: the socket is closed, and the three listener sets, the pty handlers, the early-output buffers, the pending RPC map, and the registered state collectors are all cleared. Clearing `pending` abandons in-flight promises rather than settling them — every caller of `request()`/`saveFile()` is a React effect on a page that is being torn down, so a resolution nobody is left to observe would be ceremony.

**Export the listener types; do not export `ExitListener`.** `StateListener` and `LayoutListener` are the two shapes a caller has re-declared, and the two the injected fake needs. `ExitListener` has no such caller, and an export nothing imports is what the dead-code scan exists to find.

**The test keeps its own eight-argument emitter, adapted through the real type.** The forty `act(() => stateListener!(...))` call sites vary eight fields and default the rest; rewriting them all to pass sixteen arguments would be churn that buys nothing. The fake's `onState` keeps its widening adapter, but its parameter is now the imported `StateListener`, so the adapter — and through it every call site — is checked against the real signature.

**An object literal cast to `JanusClient`, matching `useLayoutState.test.tsx`.** That file already establishes the house pattern for a partial fake of this service (`{ ... } as unknown as JanusClient`); a second, differently-shaped convention in the same directory would be the worse outcome.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The single client construction site to move | `web/src/App.tsx:34`–`:35` |
| The composition root that will own it | `web/src/main.tsx` |
| The socket, listener sets, pty handlers and buffers to release | `web/src/ws.ts:25`–`:38` |
| The `globalThis.addEventListener` convention | `web/src/useWindowFocus.ts:11`, `web/src/useCmdW.ts:20` |
| The partial-fake-cast-to-`JanusClient` pattern | `web/src/useLayoutState.test.tsx:16`–`:24` |
| A stubbed global `WebSocket` with a spied `close()` | `web/src/ws.test.ts:6`–`:26` |
| The module mock being replaced | `web/src/App.test.tsx:15`–`:57` |

## Implementation steps

1. **`web/src/ws.ts`: export the two listener types.** Change `type StateListener` and `type LayoutListener` to `export type`. `ExitListener` stays private.

2. **`web/src/ws.ts`: add `dispose()`.** A public method beside `attachPty` that calls `this.ws.close()`, then clears `stateListeners`, `exitListeners`, `layoutListeners`, `ptyHandlers`, `ptyBuffers`, and `pending`, and resets `stateCollectors` to an empty object. Carry a short comment in the file's existing voice noting that in-flight `request()`/`saveFile()` promises are abandoned rather than settled.

3. **`web/src/App.tsx`: take the client as a prop.** Change `import { JanusClient }` to `import type { JanusClient }`, and replace the `clientReference` pair with a destructured `{ client }: { client: JanusClient }` parameter on `export function App`. Nothing else in the body changes — every consumer already reads the local `client`.

4. **`web/src/main.tsx`: construct, pass, and release.** Import `JanusClient`, build one instance, register `globalThis.addEventListener('pagehide', () => client.dispose())`, and pass `client={client}` to `<App />`.

5. **`web/src/App.test.tsx`: inject the fake.** Delete the `vi.mock('./ws', …)` block and the locally re-declared `ServerStateListener` and `LayoutListener` types. Import `StateListener`, `LayoutListener`, and `JanusClient` as types from `./ws`. Rename the test's own eight-argument shape from `StateListener` to `EmitState` so it no longer shadows the imported name. Build one module-level fake with the existing `sendMock`/`requestMock`/`renameTabMock`/`registerStateCollectorMock` wired to it, cast `as unknown as JanusClient`, whose `onState` takes a `StateListener` and installs the widening adapter and whose `onLayout` takes a `LayoutListener`. Change every `render(<App />)` to `render(<App client={client} />)`. Drop `HarnessLaunchView`, `ProfileRow`, and `ScheduleLaunchView` from the `@shared/protocol` type import — the deleted `ServerStateListener` was their only user.

## Tests

- `web/src/ws.test.ts` — `dispose()` closes the socket; a state listener registered before `dispose()` is not called for a `state` event that arrives after it; a layout listener likewise; an exit listener likewise; a handler attached with `attachPty` receives no further `pty` data after `dispose()`; buffered early output is dropped, so a handler attached *after* `dispose()` is flushed nothing.
- `web/src/App.test.tsx` — the whole file now runs against an injected client, which is the standing check that `App` uses what it is given. One new case pins the rule directly: rendering `App` with an injected client opens no `WebSocket` of its own (global `WebSocket` stubbed with a spy constructor, asserted never called).
- `web/src/useLayoutState.test.tsx` and every other `web/src/` suite must pass **unchanged** — they already receive the client as a prop or an argument, which is the check that the fifty-eight other importers are untouched.

## Out of scope

- **Rewriting `web/src/useLayoutState.test.tsx`'s local `LayoutEvent` type** to use the newly exported `LayoutListener`. It re-declares a superset that happens to be harmless for input, and the backlog item scopes this change to the four production/test files it names.
- **A context provider for the client.** Every consumer already receives it through props; introducing a provider would be a second way to reach the same instance.
- **Disposing the client on `App` unmount.** The instance outlives the React root by design — the owner is `main.tsx`, and an unmount-time dispose would fight React StrictMode's double-mount.
- **Removing the `await import('./App')` calls in `App.test.tsx`** now that no `vi.mock` hoisting depends on them. Churn across forty tests for no behavior change.
- **Any change to the WebSocket wire protocol, the reconnect story, or the `bye`-driven `window.close()`.**
