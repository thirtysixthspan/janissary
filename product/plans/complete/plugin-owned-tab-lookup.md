# Resolve a plugin's own tabs through one lookup helper

**Complexity: 3/10** — ~18 added lines across 5 production files, 6 test scenarios, 2 new units (p=4.51).

The question "which tabs does this plugin own?" is answered by four hand-rolled scans in four capability modules and by two more `findIndex` calls in one of them, while a fifth site beside them already asks the same question through `pluginTabByInstanceKey`. Each copy filters `managers.tab.tabs` on `tab.plugin?.id === declaration.id`, sometimes narrowed by `instanceKey`, and each returns a different shape — a list of instance keys, a list of labels, a boolean, a tab, or an index. The definition of ownership has no single owner, and the suites that cover these capabilities test each copy independently, so a change to one scan can drift from the rest without a failing test.

## Goal

One exported helper in `src/tab/lookup.ts` defines "owned by this declaration id, optionally narrowed to one instance key" and returns each matching tab together with its index. Every plugin capability that needs that answer calls it; none re-derives the predicate. Behavior is unchanged for every caller — the same tabs match, in the same strip order, with the same first-match semantics.

## Design decisions

**A plain predicate, not the view-guard accessors.** The existing scans match on `tab.plugin?.id` alone; `pluginTabByInstanceKey` additionally applies the `isPluginTab` guard. The new helper keeps the plain predicate so tabs that carry a plugin record are still found even when a fixture or a mid-activation record has no `view: 'plugin'` discriminant. Applying `isPluginTab` here would silently stop those tabs from matching and change behavior. `pluginTabByInstanceKey` keeps its own guard-typed contract and is not rewritten.

**The helper returns `{ tab, index }` pairs.** Key-list callers map over `tab.plugin.instanceKey` or `tab.label`; the two index callers take `[0]?.index`. `flatMap` preserves strip order and the first match wins, matching the `flatMap`/`filter`/`find`/`findIndex` calls it replaces.

**Direct import from `lookup.js`, through the existing `tabs` array.** Production modules already import pure lookup helpers this way (`src/commands/schedule.ts`, `src/monitor/targets.ts`, `src/controller/completion.ts`). Reading `managers.tab.tabs` at call time keeps every existing test fake working, since they all supply a `tabs` array; no new `TabManager` method or fake method is needed.

**`setUnread`, `setBusy` and `snapshotTab` keep `pluginTabByInstanceKey`.** They resolve a single tab by instance key with the guard-typed accessor and are not list or index scans; the item asks only that the four scans and two `findIndex` sites move. The two helpers coexist in `lookup.ts` with explicit, different contracts.

## Implementation steps

1. **`src/tab/lookup.ts`** — add `OwnedPluginTab` (`{ tab: Tab & { plugin: NonNullable<Tab['plugin']> }; index: number }`) and `ownedPluginTabs(tabs: Tab[], id: string, instanceKey?: string): OwnedPluginTab[]` beside `pluginTabByInstanceKey`. One short comment records that this is the single ownership definition and why it uses the plain predicate.
2. **`src/plugins/notifications.ts`** — `ownedTabs` delegates to `ownedPluginTabs(managers.tab.tabs, id).map(({ tab }) => tab.plugin.instanceKey)`.
3. **`src/plugins/line-capabilities.ts`** — `ownTabLabels` delegates to `ownedPluginTabs(managers.tab.tabs, declaration.id).map(({ tab }) => tab.label)`.
4. **`src/plugins/own-tab-capabilities.ts`** — `ownTabKeys` delegates to the helper's key list; `dockTab` and `closeOwnTab` take the first `ownedPluginTabs(managers.tab.tabs, declaration.id, instanceKey)` entry's `index` instead of a local `findIndex`.
5. **`src/plugins/context.ts`** — `openOrFocusTab`'s `some` and `find` scans become `ownedPluginTabs(managers.tab.tabs, declaration.id, instanceKey).length > 0` and `…[0]?.tab`, preserving the "already existed" gate and the `registerTab(created.label)` path.
6. Confirm by grep that `tab.plugin?.id ===` no longer appears in these five capability modules.

## Tests

- **`src/tab/lookup.test.ts`** (extended) — `ownedPluginTabs` returns every tab of the named id with the right index and in strip order, narrows to one instance key when given, and is empty for an unknown id or key.
- **`src/plugins/context.test.ts`** (extended) — register a fixture tab and an other-plugin tab, then assert `ownTabKeys`, `setBusy`, `snapshotTab`, `setUnread`, `dockTab` and `closeOwnTab` see only the fixture's tab; give the fake `pluginTabByInstanceKey` a default implementation backed by the real lookup so the guard-typed capabilities resolve over the same array.
- **`src/plugins/notifications.test.ts`** (extended) — two subscribed plugins each with an open tab; each `notify` receives only its own instance key.
- **Unchanged by construction** — `src/plugins/shell-capabilities.test.ts`, `src/plugins/dock-tab.test.ts`, `src/plugins/close-own-tab.test.ts`, `src/plugins/snapshot-tab.test.ts`, and all existing cases in the extended suites. `./scripts/run.mjs check-diff` gates every step.

## Spec

Pure refactor, no user-visible behavior: `Spec: none needed (refactor only)`.

## Out of scope

- Rewriting `pluginTabByInstanceKey` or exposing the new helper as a `TabManager` method.
- Ownership scans outside the plugin capability layer (`src/models/manager.ts`, `src/tab/openers.ts`, `src/conversations/*`, etc.), which ask different questions on different predicates.
- `src/plugins/context.ts`'s `findIndex` calls in other capabilities that need an index for an unrelated purpose.
- Any change to plugin API versions, declarations, or client-visible state.
