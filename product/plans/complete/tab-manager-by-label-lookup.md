# Give the tab manager a by-label lookup, with guard-typed view accessors

**Complexity: 4/10** — one new module, six methods delegating from the manager, and eight call sites migrated across five files. Deliberately partial: the scan-then-check-payload sites move, the plain scan-for-a-tab sites are left for a follow-up. No behavior changes.

`TabManager` (`src/tab/manager.ts`) declares `tabs: Tab[]` as a public field and offers `findIndex(label)` (an index) and `cur()`, but no by-label lookup. So callers write `this.managers.tab.tabs.find((t) => t.label === label)` — fifty-two occurrences across thirty-one non-test modules — and then read or write the returned record's view payload directly, which is the shape the architecture principles say nothing outside the owner should reach for.

The sites that hurt are the ones that follow the scan with an optional-chained payload check: `src/harness/manager.ts` has five, `src/editor/save.ts` and `src/editor/resync.ts` one each, `src/monitor/window.ts` two. Each re-derives both the scan and the "does this tab really have that payload" question, so one site's guard written against the wrong payload field mutates or reads a tab the discriminant says has no such view.

## Goal

One lookup method on the manager, plus guard-typed accessors that hand back a narrowed tab or nothing — so a caller gets a non-optional payload instead of a `Tab` plus its own optional-chained check.

## Design decisions

**A new `src/tab/lookup.ts`, with the manager delegating.** `src/tab/manager.ts` is 247 raw lines and close to the counted limit, so the accessors live beside it and are reached the way `runtime-operations.ts` and `transcript-operations.ts` already are. The functions take `tabs: Tab[]` as their first argument, matching those modules exactly.

**Six new methods push `manager.ts` over the 200-line limit, so a second module comes out of it.** The delegations themselves are one-liners, matching the dozen already in that file, and that is still 205 counted lines. Per the code guidelines the answer is extraction, not compaction: `src/tab/selection-operations.ts` takes the six methods that mutate which tab is selected and the focus history behind it — `markUnread`, `recordLeavingActiveTab`, `popFocusHistory`, `repairSelections`, `mostRecentFileNavigatorLabel`, `applyOpenResult`. They are a cohesive group, and they follow the `tabOperations.setActiveTab(this, …)` port pattern this file already uses, so the manager keeps all six methods and their signatures while the bodies move. Nothing outside the manager changes.

**`byLabel` returns the first match, exactly as `find` does.** Behavior must not move; this is an accessor, not a new rule. It is a linear scan today, and the point of routing every lookup through one method is that a map or a guard can go behind it later without touching fifty-two call sites.

**Five guard-typed accessors, built on the predicates that already exist.** `harnessTab`, `editorTab`, `filesTab`, `pluginTab`, `monitorTab` each compose `byLabel` with the matching predicate from `src/tab/view-guards.ts` and return the narrowed type. Those predicates check *both* the `view` discriminant and the payload, which is strictly stronger than the `tab?.harness` checks being replaced — a tab whose `view` says `harness` but whose payload is missing (caught mid-provision) was previously read as a harness tab by every one of these sites.

**Only the scan-then-check-payload sites migrate.** Those are the ones the guards actually improve. The remaining plain scan-for-a-tab sites across the other twenty-six modules are a mechanical follow-up, and sweeping all fifty-two in one change would bury the behavior question this one has to answer per site.

**`src/editor/sync.ts` is not migrated, despite being named in the item.** Its scan is `tabs.find((t) => t.editor?.url === url)` — keyed by the editor's URL, not by label. A by-label lookup cannot serve it, and inventing a `byEditorUrl` accessor is a different piece of work with a different key. The same is true of the two URL-keyed scans in `src/editor/save.ts`; only its label-keyed one moves.

**`closeMonitorTab` keeps its `findIndex`,** because it needs an index for `closeTab`, not a tab. It is migrated only in the sense that its hand-written `t.view === 'monitor' && t.label === name` test becomes `monitorTab(name)` — the predicate that also checks the payload — with the index looked up separately.

**The array stays public.** A caller can still bypass the accessor and edit a record in place; closing that off means making `tabs` private and routing every mutation through the manager, which is a much larger change.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The narrowing predicates and their payload types | `src/tab/view-guards.ts` |
| The delegation pattern the new module follows | `src/tab/runtime-operations.ts`, `src/tab/transcript-operations.ts` |
| The index lookup this sits beside | `TabManager.findIndex`, `src/tab/manager.ts:93` |
| The five harness sites | `latestScreenText`, `transcriptTailer`, `browserGone`, `markRunning`, `failSpawn` (`src/harness/manager.ts`) |
| An existing consumer of the predicates | `monitorTabs`, `src/monitor/window.ts:30` |

## Implementation steps

1. **`src/tab/lookup.ts`.** Export `byLabel(tabs, label)` and the five guard-typed accessors, each `(tabs, label) => <Narrowed> | undefined`.

2. **`src/tab/selection-operations.ts`.** Move the bodies of the six selection/focus-history methods behind a `TabSelectionPort` (`tabs`, `activeTab`, `secondaryTabLabel`, `focusHistory`), mirroring `TabOperationsPort`.

3. **`src/tab/manager.ts`.** Add `byLabel(label)`, `harnessTab(label)`, `editorTab(label)`, `filesTab(label)`, `pluginTab(label)`, `monitorTab(label)`, each a one-line delegation beside `findIndex`; reduce the six moved methods to one-line delegations too.

4. **`src/harness/manager.ts`.** Migrate all five sites to `harnessTab(label)`, dropping each `tab?.harness` check and the optional chaining behind it.

5. **`src/editor/save.ts` and `src/editor/resync.ts`.** Migrate the one label-keyed site in each to `editorTab(label)`.

6. **`src/monitor/window.ts`.** `updateMonitorMeta` uses `monitorTab(name)`; `closeMonitorTab` tests `monitorTab(name)` and then takes the index from `findIndex`.

## Tests

- **`src/tab/lookup.test.ts`** (new) — `byLabel` finds a tab, returns `undefined` for a missing label, and returns the *first* of two same-labelled tabs exactly as `find` does; each guard accessor returns the narrowed tab for its own kind, and `undefined` for a missing label, for a tab of another kind, and — the case the old checks got wrong — for a tab whose `view` names the kind but whose payload is absent.
- **`src/tab/manager.test.ts`** — the six new methods delegate to the module and answer for the manager's own `tabs`.
- **`src/harness/manager.test.ts`, `src/harness/manager-browser.test.ts`, `src/monitor/manager.test.ts`, `src/monitor/window.test.ts`** — each builds a structural fake `Managers` whose `tab` is an object literal carrying only the methods the code under test calls, so widening the manager's surface necessarily reaches them: a migrated site calling `harnessTab`/`monitorTab` on the fake throws `is not a function`. Each fake gains the one accessor it needs, delegating to the real `lookup` function over the same `tabs` array so the stub stays faithful rather than re-implementing the scan. Their assertions do not change — that is the check that behavior did not move.
- **`src/editor/save.test.ts` and `src/editor/resync.test.ts`** pass **unchanged**: both build their managers around a real `TabManager`.

## Out of scope

- **The remaining plain scan-for-a-tab sites** in the other twenty-six modules.
- **Making `tabs` private**, or routing mutation through the manager.
- **A `Map<label, Tab>` index behind `byLabel`.** The accessor makes that possible later; adding it now would mean keeping the map in step with every mutation of a public array.
- **A URL-keyed accessor** for the editor sites that look a tab up by `editor.url`.
- **`monitorTabs`**, which filters rather than looks one up and already uses the predicate.
