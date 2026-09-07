# Sweep the feature managers' hand-written tab scans onto the single lookup surface

**Complexity: 6/10** — four named lookup helpers added beside `src/tab/lookup.ts` with one-line manager delegations, plus a mechanical migration of roughly thirty call sites across twenty-five listed production files. No behavior change anywhere by design; the pinned tests keep passing as the gate.

`src/tab/lookup.ts` and the `TabManager` accessors are the intended tab-lookup surface, but production code still hand-scans the raw `tabs` array at ~55 plain label sites across ~25 feature modules (not counting the tab module's own internals, which own their arrays), the payload-predicated scans re-derive their guards, and four distinct lookup keys have no named home at all — so new code keeps reaching for `tabs.find`.

## Goal

One idiom for lookup-by-identity: every plain `label ===` scan in a feature manager becomes `managers.tab.byLabel(label)` (or the matching guard-typed accessor where the site then reads a specific payload), and each genuinely different key gets a named, typed home in `lookup.ts`.

## Design decisions

**Four new lookup helpers, shaped like the existing five.** They take `tabs: Tab[]` first, exactly as `byLabel` and the guard accessors do, and the manager delegates:

- `harnessTabByPtyId(tabs, ptyId)` — a running harness by its transport's pty id.
- `editorTabByUrl(tabs, url)` — an editor tab by its connection URL.
- `pluginTabByInstanceKey(tabs, id, instanceKey)` — a plugin tab by its declaration id plus instance key.
- `filesTabByRoot(tabs, root)` — a file-navigator tab by its tree root.

`TabManager` gains the four delegations (one-liners beside the existing ones).

**Only the plain `label ===` scans migrate, and only in the listed files.** The sweep is about lookup-by-identity (one producer of the "does this tab exist" question); scans keyed by other predicates keep their written intent unless a named helper now serves them. The tab module's own internals, the alias-resolution scans, and the unlisted stragglers keep their shape.

**Case-insensitive alias resolution stays exactly as it is.** `src/commands/resolve-target.ts` and `src/agent/message-queue.ts` match `label.toLowerCase() === key || title?.toLowerCase() === key` — a user-facing alias resolution with a title fallback, not a by-label identity lookup. `byLabel` is case-sensitive by design ("an accessor, not a new rule"); forcing these through it would change behavior. They stay; noted in the plan, not silently dropped.

**`controller/events.ts`' harness index lookup composes the new helper with `findIndex`.** It needs an index for `closeTab(index)`, so it resolves `managers.tab.harnessTabByPtyId(event.id)` and takes `managers.tab.tabs.indexOf(tab)` — the same tab `findIndex` returned first, by construction.

**`capture/manager.ts` collapses three round-trip scans into one lookup.** Its dispatch did `find → execute → find → find` on the same synchronous span; `const tab = byLabel(label)` captured once is equivalent, and it removes the only non-null assertion in the sweep (a `.filter()` check that a mid-step mutation cannot occur — `executeCommand` is awaited, so the guard stays).

**`src/editor/watch-manager.ts` reads `tab.editor`, so it uses `editorTab(label)`** — the existing guard accessor that returns a narrowed editor tab — rather than `byLabel` plus its own optional-chained read.

**`acp/runner.ts` no longer exists** (deleted by the running-entry migration); the sweep list predates that. Its work is done by whoever calls into `acp` now.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The delegation port pattern between lookup and manager | `src/tab/lookup.ts` ↔ `src/tab/manager.ts` |
| The guard-typed narrowing predicates | `src/tab/view-guards.ts` |
| The by-label accessor all label scans collapse onto | `TabManager.byLabel` |
| The delegation style the new helpers follow | `harnessTab`, `editorTab`, `filesTab`, `pluginTab`, `monitorTab` |

## Implementation steps

1. **`src/tab/lookup.ts`**: add the four keyed helpers, guard-typed exactly like the existing five (`EditorTab`, `FilesTab`, `HarnessTab`, `PluginTab`).
2. **`src/tab/manager.ts`**: add the four one-line delegations.
3. **Plain `label ===` sweeps** — `managers.tab.byLabel(label)` (or `this.managers.tab.byLabel(label)`): `src/shell-manager.ts` (2), `src/capture/manager.ts` (3→1 as above), `src/schedule/manager.ts` (3), `src/connection/manager.ts` (1), `src/notifications.ts` (1), `src/agent/communication-manager.ts` (2), `src/pseudoterminal-manager.ts` (1), `src/controller/transcript.ts` (2), `src/harness/busy-status.ts` (1), `src/harness/subcommands.ts` (1), `src/harness/remote-launch.ts` (1), `src/shell-promotion.ts` (2), `src/profile/manager.ts` (2), `src/profile/remote-agent.ts` (1), `src/profile/editors.ts` (1), `src/acp/manager.ts` (2), `src/editor/watch-manager.ts` (1 → `editorTab`), `src/ssh-manager.ts` (1), `src/file-navigator/manager-state.ts` (1), `src/file-navigator/open.ts` (1), `src/commands/schedule.ts` (1), `src/commands/search.ts` (1).
4. **Predicate migrations**: `src/editor/save.ts` (2) and `src/editor/sync.ts` and `src/editor/resync.ts` and `src/editor-suggest/handler.ts` → `editorTabByUrl`; `src/remote/manager.ts` and `src/controller/events.ts` → `harnessTabByPtyId`; `src/plugins/context.ts` (`snapshotTab`) → `pluginTabByInstanceKey`; `src/file-navigator/open-command.ts` (the `t.files?.root === root` site) → `filesTabByRoot`.
5. **Confirm by grep**: `tabs.find(` across non-test `src/` contains no plain `label ===` scan outside the tab module, no `editor?.url` scan, no `harness?.ptyId` scan, no plugin instance-key scan, and no bare `files?.root` scan.

## Tests

- **`src/tab/lookup.test.ts`** (extended) — each new helper returns the narrowed tab for its own key, `undefined` for a miss, and the first match among several.
- **Unchanged-by-construction**: `src/tab/manager.test.ts`, `src/managers.test.ts`, `src/controller.test.ts`, `src/tab/lookup.test.ts`'s existing cases, and every feature-manager test involved in the sweep — Site tests were pinned on behavior, not on the scan idiom; where one nonetheless asserts on private call shape, it is updated to the same expectation expressed through the manager accessor (e.g. `capture/manager.test.ts`, `monitor/ask.test.ts` untouched). `./scripts/run.mjs check-diff` gates every step.

## Spec

Pure refactor, no user-visible behavior: `Spec: none needed (refactor only)`.

## Out of scope

- **Making `tabs` private**, or any storage change behind `byLabel` — the array stays public (same as the earlier migration plan).
- The **tab module's own internals** (`src/tab/*.ts`), which receive `tabs` arrays and have no manager in scope.
- **Case-insensitive title-fallback alias scans**: `src/commands/resolve-target.ts`, `src/agent/message-queue.ts`, `src/monitor/targets.ts`.
- **Unlisted one-off scans** kept as written: `src/connection/close.ts` (ssh/remote id keys), `src/profile/view-tabs.ts` (target.matches), `src/conversations/manager.ts`, `src/file-navigator/manager-files.ts`, `src/file-navigator/open-command.ts`'s remote root+address compound scan, `src/plugins/requests.ts`, `src/notifications-tab.ts`, `src/open-file-manager.ts` (editor-by-path), `src/plugins/context.ts`'s `findIndex` (needs an index for `setDock`).
