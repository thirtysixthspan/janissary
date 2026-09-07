# Walk the dispose registry on the tab-close path, with a closeTab method per manager

**Complexity: 7/10** — one optional lifecycle method, eleven thin manager additions, a rewrite of `src/tab/cleanup.ts`, signature cleanup of the test-era scaffolding, and the test file migrated plus one new guarantee test. No user-visible behavior change beyond ordering guarantees the registry now states in code.

`closeTabResources` in `src/tab/cleanup.ts` releases each of a tab's resources by calling a different manager by hand in a fixed sixteen-line sequence, and its signature carries test-era scaffolding — a map-or-number union parameter, an optional queue map, and a legacy tab-count parameter the one production caller (`src/tab/close.ts`) never passes. The per-tab context and queue entries live on the tab's runtime record now; the maps were vestigial.

## Goal

A tab's close choreography is: a walk of `MANAGER_DISPOSE_ORDER` calling `closeTab(label)` where a manager defines it, surrounded by the few genuinely order-sensitive steps that stay explicit — so a new manager defines `closeTab` (one method) instead of someone taste-editing a checklist in three places.

## Design decisions

**`closeTab?(label: string): void` joins `dispose?` on `ManagerLifecycle`** (`src/managers.ts`). The walk (`for` over `MANAGER_DISPOSE_ORDER`) skips three names and everything else is data:

- `workspace` skipped — its release stays the explicit deferred cancel + `setTimeout(..., 0)` block above the walk (the UI-freeze exception).
- `tab` skipped — `TabManager` already owns `closeTab(index)` as the orchestrating entry point; its own steps stay explicit below.
- `database`'s walk position releases the tab (`closeTab` → `forgetTab`), but the last-tab `closeAll` stays explicit at the end of the walk.
- `remote`'s `closeTab` runs inside the walk (after every remote-speaker, which is exactly why the dispose order puts it there), gated by the same conditional the hand-written list had.
- `deleteBusy` + `forgetPersisted`, then `deleteAgentState`, `TranscriptStore.remove`, the last-tab close, and the `tab:removed` emit remain explicit — they are the tab/disk-side steps that have an ordering constraint among themselves.

The walk's order differs from the hand sequence (file-navigator/watch release before `acp`/`browser` instead of after). Nothing in the pinned tests depends on the old order; the registry is the order the architecture already states for teardown.

**`deleteBusy` stays explicit** (it is `managers.tab`, skipped from the walk), keeping the queue-idle dispatch the current sequence performs.

**Signature: `(tab, managers, openFiles, nonDockedCount)`.** The context/queue maps and the legacy count die with their params; the plugin/editor open-file drops stay (they read the tab's payload at the end, where they are the "release the tab's own references" block, still passed `openFiles` by `close.ts`).

## Implementation steps

1. **`src/managers.ts`**: add `closeTab?(label: string): void;` to `ManagerLifecycle`.
2. **Thin delegations**: `ShellManager.closeTab` (→ `close`), `AcpManager.closeTab` (→ `close`), `ScheduleManager.closeTab` (→ `delete`), `Questions.closeTab` (→ `cancelTab`), `RemoteManager.closeTab` (→ `release`), `DatabaseManager.closeTab` (→ `forgetTab`). `pty`, `editorAcp`, `browser`, `fileNavigator`, `editorWatch` already define `closeTab(label)`.
3. **`src/tab/cleanup.ts`**: rewrite to the walk described above; drop the union/queue/legacy-count parameters and the map deletions.
4. **`src/tab/close.ts`**: unchanged call shape (`nonDockedCount` already third positional after openFiles — keep; it passes 4 args today).

## Tests

- **`src/tab/cleanup.test.ts`** — migrated: fakes carry `closeTab` per manager (the promise moved from each hand call to the method), the context/queue map cases retire with the parameters, and every asserted side effect is the same call by the same manager.
- **New guarantee case** — a manager defining `closeTab` is reached for every closed tab: the test asserts the walk visited exactly the set of managers in `MANAGER_DISPOSE_ORDER` that define `closeTab` (skip list included), which the checklist can only promise by review.

## Spec

`Spec: none needed (refactor only)` — the tab-closing contract is unchanged.

## Out of scope

- Renaming `ShellManager.close` / `AcpManager.close` — they are the user-facing verbs `connection close shell` and `acp reset` speak.
- The dispose-order composition of `Controller.shutdown`.
- Registry members beyond the eleven the choreography already touches.
