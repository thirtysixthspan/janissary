# Route plugin-owned tab field writes through their managers

**Complexity: 5/10** — ~42 added lines across 6 production files, 7 requirements and 12 test scenarios, 4 new manager methods plus 2 write helpers (p=5.69).

Four plugin capability modules write host-owned `Tab` fields in place and remember to emit the dirty broadcast themselves. `setBusy` and `snapshotTab` in `src/plugins/own-tab-capabilities.ts` assign `tab.plugin.busy` and `tab.pageSnapshot`; `joinRemoteWorkspace` and `releaseRemoteWorkspace` in `src/plugins/remote-join-capabilities.ts` assign and delete `tab.remote` around `managers.remote.attach`/`release` with two more manual broadcasts; and `src/plugins/launch-tab.ts` plus `src/plugins/launch-tab-remote.ts` assign `tab.plugin.busy` as a clone lands and settles. Every writer has to know both the field's owning manager and the broadcast that must follow it, so a writer that forgets the broadcast leaves the view stale.

## Goal

`TabManager` and `RemoteManager` own the mutation and its broadcast for the fields they own. Capabilities keep their enable and per-instance gating, resolve the tab, then call one manager method that performs the write and emits the dirty state where the field is view-visible. Every capability module drops its local `messageBus` import. Observable behavior is unchanged: the same fields change at the same moments, and the same state broadcasts go out.

## Design decisions

**Managers own mutation plus broadcast; capabilities own gating.** `setBusy` keeps its `isEnabled` check, its `pluginTabByInstanceKey` lookup, and its "already in the requested state" short-circuit. `snapshotTab` keeps its `isEnabled` check and lookup. The remote-join capabilities keep the source/channel/attach checks around `managers.remote.attach` and still decide when to release, so the deadline gate and release bookkeeping stay in the capability. Only the field write and the broadcast move behind a manager method.

**Methods take the resolved `Tab`, not a label.** Every call site has already resolved the exact tab through `pluginTabByInstanceKey` or `byLabel`. Passing that tab avoids a second lookup that would miss the fixture tabs in the capability unit tests, and keeps the existing scoping guarantees intact. This matches the `TabManager` methods that already take a `Tab` (`insertTabInGroup`).

**`pageSnapshot` carries no broadcast.** It is server-only and never reaches `buildTabView`, so `setPageSnapshot` only writes the record. `busy` and `remote` are view-visible, so their setters and the remote clear emit `messageBus.emit('state', { type: 'dirty' })` exactly where the direct assignments did.

**Launch writes keep their moment.** `launch-tab.ts` and `launch-tab-remote.ts` set `busy` true while a clone provisions and false once it settles. Those calls move to `managers.tab.setPluginBusy(tab, busy)` with no gating added, so the busy dot changes at the same point in each lifecycle.

**Write helpers live in the existing `src/tab/operations.ts`, keeping `TabManager` under the 200-line limit.** `TabManager` is already near that limit, so the write logic lives in `operations.ts`, which `TabManager` already imports as `tabOperations` and which already imports `Tab` and `messageBus`. The manager methods are thin delegators, so no new import line pushes the manager over the limit. The same helpers are imported by the unit-test fakes, so the write and broadcast are defined once and the tests keep asserting the same observable effect.

## Implementation steps

1. **`src/tab/operations.ts`** — export `setPluginBusy(tab, busy)` (writes `tab.plugin.busy` when the tab has a plugin record, then emits dirty) and `setPageSnapshot(tab, text)` (writes `tab.pageSnapshot` with a fresh timestamp, no emit). **`src/tab/manager.ts`** — add thin `setPluginBusy(tab, busy)` and `setPageSnapshot(tab, text)` methods delegating to `tabOperations`.
2. **`src/remote/manager.ts`** — import `type { RemoteTarget, Tab }` from `../tab/types.js`; add `setRemoteTarget(tab: Tab, remote: RemoteTarget): void` (writes `tab.remote`, emits dirty) and `clearRemoteTarget(tab: Tab): void` (deletes `tab.remote`, emits dirty).
3. **`src/plugins/own-tab-capabilities.ts`** — `setBusy` keeps its guards and calls `managers.tab.setPluginBusy(tab, busy)`; `snapshotTab` calls `managers.tab.setPageSnapshot(tab, text)`. Remove the `messageBus` import.
4. **`src/plugins/remote-join-capabilities.ts`** — after a successful `attach`, call `managers.remote.setRemoteTarget(tab, { address, host })`; after `release`, call `managers.remote.clearRemoteTarget(tab)`. Remove the `messageBus` import.
5. **`src/plugins/launch-tab.ts`** — in `runReady` and `awaitClone`, replace the direct `tab.plugin.busy` write plus broadcast with `managers.tab.setPluginBusy(tab, busy)`. Remove the `messageBus` import.
6. **`src/plugins/launch-tab-remote.ts`** — replace the two `busy` writes plus broadcasts in the launch and ready paths with `managers.tab.setPluginBusy(tab, busy)`. Remove the `messageBus` import.
7. Confirm by grep that `messageBus` no longer appears in these four plugin modules and that the only remaining writes to `tab.plugin.busy`, `tab.pageSnapshot`, and `tab.remote` in the plugin launch/capability layer are inside the new manager methods.

## Tests

- **`src/tab/manager.test.ts`** (extended) — `setPluginBusy` writes the busy flag and emits dirty for a plugin tab and is a no-op for a tab with no plugin record; `setPageSnapshot` writes text and a fresh timestamp and emits nothing.
- **`src/remote/manager.test.ts`** (extended) — `setRemoteTarget` writes `tab.remote` and emits dirty; `clearRemoteTarget` deletes it and emits dirty.
- **`src/plugins/context.test.ts`** (extended) — give the fake tab manager `setPluginBusy`/`setPageSnapshot` backed by the `operations.ts` helpers so the existing `setBusy` and cross-plugin tests keep asserting the same field and broadcast effect; assert the new methods are called with the resolved tab.
- **`src/plugins/remote-join-capabilities.test.ts`** (extended) — give the fake remote manager `setRemoteTarget`/`clearRemoteTarget` that perform the write and broadcast so the existing join/release assertions hold; assert the new methods are called with the resolved tab and the source remote.
- **`src/plugins/launch-tab-remote.test.ts`** (extended) — give the fake tab manager a `setPluginBusy` that writes the flag, so the existing busy true/false assertions hold.
- **Unchanged by construction** — `src/plugins/snapshot-tab.test.ts` and `src/plugins/launch-tab.test.ts` use a real `TabManager`, so the new methods work without fixture changes; all existing cases in the extended suites keep passing. `./scripts/run.mjs check-diff` gates every step.

## Spec

Pure refactor: no user-visible behavior changes. `Spec: none needed (refactor only)`.

## Out of scope

- Writes to `tab.remote` outside the plugin launch/capability layer (`src/sessions/ssh-bridge.ts`, `src/harness/tab-spawn.ts`, `src/tab/openers.ts`), and writes to `pageSnapshot` in monitor tests.
- Changing the busy dot's dedupe rule, the remote-join deadline gate, or the `attach`/`release` lifecycle.
- Any plugin API version, declaration, or wire-contract change.
