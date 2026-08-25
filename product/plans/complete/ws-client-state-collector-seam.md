# Break `ws.ts`'s dependency on the file-navigator selection registry

**Complexity: 4/10** — one new type-only module, one registration method and one lookup on `JanusClient`, one effect at the app boundary, and the tests that pin the seam. No new architecture, no wire-protocol change, and no behavior a user can observe changes.

`web/src/ws.ts` is the protocol client — the lowest service in the web app and one of its most-churned files. Line 2 imports `collectNavigatorSelections()` from `web/src/file-navigator-selection-registry.ts` and line 83 calls it while answering the server's `collect-tree-state` request. A service therefore reaches upward into one feature's client-only React state, against §8 (each layer imports downward only) and §3 (a feature and the shared layer must not depend on each other in that direction).

The cost is already visible in the tests: `web/src/ws.test.ts` has to import `publishNavigatorSelection`/`clearNavigatorSelection` and prime a module-level `Map` just to exercise the client's reply, and the next "the server asks the client for some feature's state" RPC has a worked example telling it to add a second such import.

## Goal

`web/src/ws.ts` imports nothing from any feature. The file navigator's collector reaches the client through a registration seam that the app boundary wires up, and `collect-tree-state` is answered from whatever is registered — with an empty list when nothing is.

## Design decisions

**A named collector registry, not a single callback.** The item that motivates this is not "the navigator's selection is special" but "the server can ask the client for state only the client has". Naming the collector — `registerStateCollector('fileNavigatorSelections', fn)` — means the second such request registers a second name rather than widening a one-off constructor argument, which is exactly the copy-the-shortcut outcome this change exists to prevent.

**The names and their return shapes live in their own module.** `web/src/client-state-collectors.ts` declares a `ClientStateCollectors` type mapping each collector name to the function that answers it. Keeping it out of `ws.ts` leaves the client's file free of the growth this registry will see, and lets a feature import the contract without importing the socket.

**A partial record, not a `Map`.** The collectors are held as `Partial<ClientStateCollectors>` so the lookup at the `collect-tree-state` case is typed exactly (`this.stateCollectors.fileNavigatorSelections?.()`), with no key-to-value cast a `Map<K, ClientStateCollectors[K]>` would force.

**Registration returns an unregister function**, matching `onState`/`onPtyExit`/`attachPty` — every other subscription on this client already hands back its own teardown, and an effect can return it directly.

**The app boundary registers, not the hook.** `useFileNavigatorSelection` never sees a client and does not need to: the registry it publishes into is module-level, so one registration for the whole app is correct, and a per-navigator registration would fight over a single name. `App.tsx` already owns the client instance (`clientReference.current ??= new JanusClient()`), which is where §7 puts this wiring — instantiate at the edge, compose in the app shell. `web/src/file-navigator-selection-registry.ts` itself is unchanged; only who reads it moves.

**An empty reply when nothing is registered.** The current code answers `[]` when no navigator is mounted, and it must keep answering `[]` in the window before the registering effect runs. `?? []` preserves that exactly.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Subscription methods that return their own unsubscribe | `web/src/ws.ts` (`onState`, `onPtyExit`, `onLayout`, `attachPty`) |
| The module-level selection registry (unchanged by this plan) | `web/src/file-navigator-selection-registry.ts` |
| The hook that publishes into it (unchanged by this plan) | `web/src/useFileNavigatorSelection.ts` |
| The single client construction site | `web/src/App.tsx:33`–`:35` |
| The reply's wire shape | `FileNavigatorSelectionRecord` in `src/protocol.ts` |
| The mocked `JanusClient` the app tests render against | `web/src/App.test.tsx:33`–`:53` |

## Implementation steps

1. **New module `web/src/client-state-collectors.ts`.** Export `ClientStateCollectors` — a type whose keys are collector names and whose values are the functions that answer them, starting with `fileNavigatorSelections: () => FileNavigatorSelectionRecord[]`. Type-only, importing just the wire type from `@shared/protocol`.

2. **`web/src/ws.ts`: add the seam, drop the feature import.** Delete the `file-navigator-selection-registry` import. Add a private `stateCollectors: Partial<ClientStateCollectors>` field and a public `registerStateCollector<K extends keyof ClientStateCollectors>(name: K, collect: ClientStateCollectors[K]): () => void` that stores the collector and returns a function deleting it. Change the `collect-tree-state` case to send `this.stateCollectors.fileNavigatorSelections?.() ?? []`.

3. **`web/src/App.tsx`: register at the boundary.** Import `collectNavigatorSelections` and add an effect beside the existing `applySyntaxTheme` effect that returns `client.registerStateCollector('fileNavigatorSelections', collectNavigatorSelections)`.

4. **`web/src/App.test.tsx`: teach the mock the new method.** The mocked `JanusClient` needs `registerStateCollector()` returning a no-op unsubscribe, or every app render throws.

## Tests

- `web/src/ws.test.ts` — rewrite the two `collect-tree-state` cases against the seam rather than the registry: a registered collector's records are sent with the request id; no registered collector replies with `navigators: []`; the function returned by `registerStateCollector` unregisters, so a later request replies empty again; registering a second time under the same name replaces the first collector. The file no longer imports `file-navigator-selection-registry`.
- `web/src/App.test.tsx` — rendering the app registers the `fileNavigatorSelections` collector on the client, and unmounting it unregisters.
- `web/src/useFileNavigatorSelection.test.ts` must pass **unchanged** — it exercises the registry directly, which this change does not touch, and that is the check that the navigator half still works.

## Out of scope

- **Moving `file-navigator-selection-registry.ts` into a feature directory.** That is the separate backlog item that gathers `web/src/file-navigator/`.
- **Changing the `collect-tree-state` / `reportFileNavigatorSelection` wire shapes**, or anything on the server side of the request.
- **Registering any second collector.** The registry is built to take more; this change adds exactly the one that exists.
- **Passing the client into `useFileNavigatorSelection`.** The published selections are module-level state shared by every mounted navigator, and per-hook registration under one name would race.
- **Lint-enforcing the layer boundary** (`import/no-restricted-paths` zones). Worth doing, but it is a repo-wide config change, not this fix.
