# Global history buffer

**Complexity: 3/10** — one new small server module (in-memory buffer + JSON file persistence), two-line hooks in `CommandManager`'s dispatch methods, one new `StateEvent` field threaded through the websocket layer, and a second history prop on `CommandInput`. The two delicate spots: the module must be inert before init (existing tests dispatch hundreds of commands and must never touch the real home directory), and `App.tsx` sits ~4 counted lines under the 200-line lint ceiling.

## Goal

Add a global command-history buffer shared across all tabs. It lives in memory while the app runs, and is persisted across application runs in `~/.janissary/history.json` (the home directory — distinct from the per-project `<root>/.janissary` state dir). The file and its directory are created if they don't exist. History is stored as a JSON array of objects, each with fields:

- `command` — the command text after comment stripping and trimming (the output of `stripComments`, `src/tab-utils.ts:3`, re-exported from `src/tab.ts` — the same normalization per-tab history already gets)
- `tab` — the label of the tab it was run in
- `timestamp` — epoch milliseconds (`Date.now()`) when it was recorded

The web client's ghost-text suggestion (`findGhostSuggestion`) switches from the current tab's history to the global buffer, so a command typed in any tab (in any prior run) can ghost-complete in every tab.

## Design decisions

**New module `src/global-history.ts`, modeled on `src/agent-state.ts`.** Same shape: module-level path state, an `init` function, synchronous `node:fs`, and tolerant loading that never throws. Exports:

- `initGlobalHistory(home?: string)` — resolves `<home>/.janissary/history.json` (home defaults to `os.homedir()`, injectable for tests exactly like `RootContext.home` in `src/paths.ts:8`, quoted: `// The user's home directory (defaults to the OS home); injectable for testing.`), `mkdirSync(..., { recursive: true })` the directory, creates the file with `[]` when missing, and **replaces** the in-memory array with the file's entries (replacing, not appending, is what lets each test re-init against a fresh temp home).
- `recordGlobalHistory(command: string, tab: string)` — appends `{ command, tab, timestamp: Date.now() }`, skips consecutive duplicates, caps the buffer, and writes the file back (`JSON.stringify(entries, null, 2)`). A write failure is caught and ignored — the in-memory buffer still works and persistence must never break command dispatch.
- `globalCommands(): string[]` — just the command strings, oldest → newest, matching the ordering `findGhostSuggestion` and `getRecentHistory` already assume.

**Inert until initialized — this is load-bearing for the existing test suite.** `recordGlobalHistory` and `globalCommands` are complete no-ops (record nothing, return `[]`) until `initGlobalHistory` has run, guarded by the unset module-level path — the same pattern as `if (!stateDirectory) return;` in `clearStateDirectory` (`src/agent-state.ts:48`). Without this guard, the hundreds of `c.dispatch('…')` calls in `src/controller.test.ts` (and dispatches in `src/schedule-manager.test.ts` etc.) would write to the developer's real `~/.janissary/history.json`, because module state needs no construction to be reachable. Only `src/main.ts` `boot()` and tests that opt in ever call `initGlobalHistory`.

**Load tolerance: a corrupt or non-array file starts the buffer empty and is overwritten on the next record.** Same policy as `loadAgentState` (`src/agent-state.ts:31`): parse inside try/catch, validate shape (array of objects with string `command`, string `tab`, number `timestamp`), drop anything invalid, never crash startup.

**Cap at 1000 entries.** Per-tab history is capped at 100 (`.slice(-100)` at `src/tab-manager.ts:234`); the global buffer keeps the last 1000 entries (`slice(-1000)` on record) so the file stays small enough to rewrite synchronously on every command. If rewrite-per-command ever measures slow, the escape hatch is debouncing the write — not switching to append-only JSONL, which would change the agreed file format.

**Record in `CommandManager.dispatch` and `dispatchTo` (`src/command-manager.ts:30` and `:34`) — not in `TabManager.recordHistory`.** These two methods are the complete set of history-recording entry points: they are the only callers of `recordHistory` (`src/tab-manager.ts:229`), and every programmatic dispatcher funnels through `dispatchTo`. In each, capture `recordHistory`'s return value (the stripped/trimmed text it already computes) and, when non-empty, call `recordGlobalHistory(trimmed, label)` before passing the text to `run` — the label is already in hand at both sites (`this.managers.tab.cur().label` in `dispatch`, the `label` parameter in `dispatchTo`). The hook deliberately avoids `tab-manager.ts`, which is already ~100 counted lines over the 200-line guideline and carries `/* eslint-disable max-lines */` (`src/tab-manager.ts:1`) — `CODE_GUIDELINES.md` says don't grow such files, and `command-manager.ts` is 71 lines with ample headroom. `chooseRoute` (`src/command-manager.ts:20`) calls `run` directly and bypasses per-tab recording today; the global buffer mirrors that exactly (the original unprefixed command was already recorded when first dispatched).

**Dedup: skip when the command equals the last global entry's command, regardless of tab.** `recordGlobalHistory` checks this itself so every caller gets the rule. Consequence, stated so nobody "fixes" it: the same command run back-to-back in two different tabs is recorded once globally but appears in both tabs' per-tab histories — per-tab dedup (`tab.cmdHistory.at(-1) !== trimmed` at `src/tab-manager.ts:233`) is per-tab, global dedup is global.

**Programmatic dispatches are recorded, on purpose.** Scheduled commands (`dispatchTo` at `src/schedule-manager.ts:91`, which appends `## scheduled ##` — removed by `stripComments`, so the clean command is stored), monitor suggestions (`src/monitor-window.ts:86`), and `send` forwards (`src/commands/send.ts:23`) all flow through `dispatchTo` and land in the global buffer. This mirrors today's per-tab behavior — they already enter `tab.cmdHistory` — so the global buffer stays a faithful superset.

**Init at startup in `boot()`'s init block.** Call `initGlobalHistory()` in `src/main.ts` alongside the existing `initAgentStateDirectory(cwd)` / `loadConfig(cwd)` block (`src/main.ts:118-125`) — no `cwd` argument; this store is home-based. That places it before `startServer` (`src/main.ts:132`), whose `StateEvent`s read `globalCommands()`, and after the `--help`/`--version` early returns, so those invocations never create `~/.janissary/`. No manager, no entry in `Managers` (`src/managers.ts:18`) — it's module-level state like config and agent-state, and nothing needs to mock it through the manager graph.

**The wire carries commands only.** `StateEvent` (`src/protocol.ts:67`) gains `globalHistory: string[]`, populated at both construction sites exactly like `tabNameMaxLength` (`src/index.ts:54` and `:145`) via `globalCommands()`. `tab` and `timestamp` stay server-side — ghost text needs only the strings, and the richer fields are there for future features (a global `hist` view, per-tab filtering) without a format migration.

**Ghost text goes global; recall and the picker stay per-tab.** `CommandInput` (`web/src/CommandInput.tsx:15`) gains a second prop `ghostHistory: string[]`; the `findGhostSuggestion` call (`const ghost = findGhostSuggestion(history, value);` at `web/src/CommandInput.tsx:19`) switches to it. The existing `history` prop keeps driving ArrowUp/ArrowDown recall (`web/src/CommandInput.tsx:49-65`) and stays `current.cmdHistory` (`web/src/App.tsx:208`). The `hist` picker (`getRecentHistory(current?.cmdHistory ?? [], 10)` at `web/src/App.tsx:55`) is untouched. When both a tab-local and a global entry match the typed prefix, the global most-recent wins — `findGhostSuggestion` walks one list newest-first and there is no tab-preference tiebreak. `StateListener` (`web/src/ws.ts:3`) gains a `globalHistory: string[]` parameter, passed through at the `for (const l of this.stateListeners) l(...)` dispatch (`ws.ts:29`) — plain `event.globalHistory`, no `??` fallback needed since the field is required on `StateEvent`. `App.tsx` mirrors `tabNameMaxLength` exactly: a `useState` (`App.tsx:32`), a setter call in the `client.onState` effect (`App.tsx:83-92`), and the prop on `CommandInput`.

**`App.tsx` is at the `max-lines` boundary — plan the extraction, don't gamble.** `max-lines` is an *error* at 200 counted lines (`eslint.config.mjs:60`, `skipBlankLines: true, skipComments: true`), and `App.tsx` counts ~196 today; the ~3 added lines leave ~1 line of headroom. If lint trips, extract the window key-handler effect (the `onKey` listener effect at `web/src/App.tsx:105-132`) into a new `web/src/useWindowKeys.ts` hook modeled on `useCmdW` (`web/src/useCmdW.ts` — same shape: a hook owning a `window` listener fed by refs), passing it the existing `stateReference` snapshot and the callbacks it closes over. Never compact or strip comments to fit (`CODE_GUIDELINES.md`).

**No change to per-tab history storage or persistence.** `tab.cmdHistory` still exists, is still capped at 100, still rides `TabView.cmdHistory` (`src/protocol.ts:44`), and still persists through agent state (`src/tab-manager.ts:274`, `:325`). The global buffer is additive.

## What already exists (reuse, don't rebuild)

| Piece | Where |
| --- | --- |
| Module shape to copy (init + tolerant load + sync save + inert-before-init guard) | `src/agent-state.ts` (guard: `if (!stateDirectory) return;` at `:48`) |
| Injectable-home pattern for tests | `RootContext.home` in `src/paths.ts:8` |
| Per-tab trim + dedup (produces the text the hook records) | `TabManager.recordHistory` at `src/tab-manager.ts:229`, `stripComments` in `src/tab-utils.ts:3` |
| The two dispatch entry points to hook | `dispatch` at `src/command-manager.ts:30`, `dispatchTo` at `:34` |
| Startup init site | the `init*` block in `boot()`, `src/main.ts:118-125` |
| Config value on the wire (pattern for the new field) | `tabNameMaxLength: getConfig().tabNameMaxLength` in `StateEvent` (`src/protocol.ts:70`), populated at `src/index.ts:54` (`emitState` broadcast) and `:145` (`init` reply) |
| Client state fan-out | `StateListener` at `web/src/ws.ts:3`, dispatched at `:29`, consumed in the `client.onState` effect at `web/src/App.tsx:83-92` |
| Ghost-text matcher (pure, already list-based) | `findGhostSuggestion` in `web/src/ghost-suggestion.ts` |
| Temp-dir init pattern for integration tests | `initAgentStateDirectory(mkdtempSync(path.join(tmpdir(), 'janus-ctx-')))` at `src/controller.test.ts:207` |
| Window-key-listener hook shape (the `App.tsx` extraction fallback) | `useCmdW` in `web/src/useCmdW.ts` |

## Implementation steps

Each step leaves `./scripts/run.mjs check-diff` green; 1–2 are server-only, 3 is web-only.

### 1. Server: the buffer module

- `src/global-history.ts`: `HistoryEntry` type, `initGlobalHistory(home?)`, `recordGlobalHistory(command, tab)`, `globalCommands()`. Includes the shape validator, the 1000-entry cap, the consecutive-dedup check, and the inert-before-init guard. No separate test-only reset export — re-running `initGlobalHistory` against a fresh temp home *is* the reset, exactly how `initAgentStateDirectory` is re-called per test.
- `src/main.ts`: call `initGlobalHistory()` in the `boot()` init block (`:118-125`). Import with the `.js` extension per the NodeNext rule.

### 2. Server: record + broadcast

- `src/command-manager.ts`: in `dispatch` (`:30`) and `dispatchTo` (`:34`), capture the string `recordHistory` returns and, when non-empty, pass it to `recordGlobalHistory` with the tab label before handing it to `run`.
- `src/protocol.ts`: `StateEvent` (`:67`) gains `globalHistory: string[]` with a comment noting it feeds ghost text.
- `src/index.ts`: populate `globalHistory: globalCommands()` at both `StateEvent` construction sites — the `emitState` broadcast (`:52-55`) and the `init` reply (`:143-146`), both currently reading `tabNameMaxLength: getConfig().tabNameMaxLength`.
- `check-diff` stays green at this checkpoint even though the web side hasn't consumed the new field: the client only reads `StateEvent`, never constructs one.

### 3. Web: ghost text reads the global buffer

- `web/src/ws.ts`: `StateListener` (`:3`) gains `globalHistory: string[]`; pass `event.globalHistory` through at the dispatch (`:29`).
- `web/src/App.tsx`: new `globalHistory` state var set in the `client.onState` effect (`:83-92`), mirroring `tabNameMaxLength`; pass `ghostHistory={globalHistory}` to `CommandInput` (`:206-219`) alongside the existing `history={current.cmdHistory}`. If `max-lines` trips, do the `useWindowKeys` extraction decided above.
- `web/src/CommandInput.tsx`: add the `ghostHistory` prop; switch the `findGhostSuggestion` call (`:19`) to it. Recall keys (`:49-65`) unchanged.

## Tests

- `src/global-history.test.ts` — new, using `mkdtempSync(path.join(tmpdir(), ...))` as the injected home (the `src/controller.test.ts:207` pattern): before init, `recordGlobalHistory` is a no-op and `globalCommands()` returns `[]`; init creates `<home>/.janissary/` and `history.json` when missing; init loads existing entries; corrupt JSON / non-array / bad-shaped entries start empty without throwing; record appends `{command, tab, timestamp}` and the file round-trips through a re-init; consecutive duplicate command is skipped (including from a different tab); cap keeps only the newest 1000; `globalCommands()` returns oldest → newest command strings; a write failure (e.g. the file replaced by a directory after init) doesn't throw.
- `src/controller.test.ts` — one new test: after `initGlobalHistory(mkdtempSync(...))`, `c.dispatch(...)` records a global entry with the dispatching tab's label, and a `## comment ##` suffix is stripped from the stored command.
- `web/src/CommandInput.test.tsx` — extend: ghost text appears for a command present only in `ghostHistory` (not in `history`); ArrowUp still recalls from `history`, never from `ghostHistory`; ArrowRight accepts a ghost sourced from `ghostHistory`.
- `web/src/ghost-suggestion.test.ts` — unchanged; the matcher itself doesn't change.

## Out of scope

- Switching ArrowUp/ArrowDown recall or the `hist` picker to the global buffer — both stay per-tab; flipping them later is a prop change plus UX decisions (cross-tab recall may surprise).
- Migrating existing per-tab `cmdHistory` from agent state into the global file — the global buffer starts empty and fills as commands run.
- Cross-instance merging: two app instances running at once both rewrite `~/.janissary/history.json`; last writer wins. Acceptable for now (same policy as `.claude.json`-style dotfiles); a merge-on-write would need file locking.
- Exposing `tab`/`timestamp` in any UI — they're recorded for future use only.

## Verification

`./scripts/run.mjs check-diff` after each step. End-to-end: start the app fresh (no `~/.janissary/`), run a command in tab A — `~/.janissary/history.json` now exists and contains `[{"command": ..., "tab": ..., "timestamp": ...}]`; run the same command again — the file still holds one entry (dedup); switch to tab B and type the command's first letters — ghost text suggests it even though tab B's history is empty; ArrowUp in tab B does *not* recall tab A's command, and `hist` in tab B shows `(no history)` (the picker reads only per-tab history); restart the app — the ghost suggestion still appears with no commands run yet; corrupt the file by hand and restart — the app starts clean and the next command rewrites the file.

