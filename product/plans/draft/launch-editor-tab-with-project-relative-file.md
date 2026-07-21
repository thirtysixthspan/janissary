# Launch an editor tab with a targeted project-relative file

Let a profile open one or more editor tabs on named files the moment it launches, the same way it already opens file-navigator, notifications, and schedules tabs. A new profile-level `editors` key lists files to open in the in-app plain-text editor; each entry names a `path`, an optional tab to resolve a relative path against (`in`), an optional `line` to place the cursor on, and an optional `tab` presentation carrying a tab `number` and a `focus` flag. Path resolution matches the existing `files` key exactly: `$root`/`~` expand against the launch directory, and any other relative path resolves against the resolving tab's working directory. A missing file opens an empty new-file buffer, reusing the `edit` command's own new-file behavior. This ships alongside a generalized main-area focus model: any main-area entry — agent, harness, or editor — may declare `focus: true`, and among those that do, the lowest-numbered one becomes the active tab once the profile finishes launching; when none declares focus, the launch lands on its first newly opened tab as it does today. The `features` profile is updated to open `product/backlog/features.md` in an editor tab.

## Design decisions

1. **New top-level `editors` key.** Profiles gain an `editors` array parallel to `files`/`notifications`/`schedules`. Each element is an editor entry: `path` (required string), `in` (optional tab label), `line` (optional number), and `tab` (optional presentation object). The name reads as "the editor tabs this profile opens." An unrecognized key stays ignored, so older profiles are unaffected.

2. **Path resolution mirrors the `files` key.** An entry's `path` is resolved exactly as the `edit` command already resolves its target: `expandUserPath` expands `$root` to the launch directory and `~` to home, and any remaining relative path resolves against the resolving tab's working directory. A bare project path is therefore written portably as `$root/product/backlog/features.md`, independent of which tab opened it. This is the behavior the user chose over "bare path relative to project root."

3. **Resolving tab defaults to the profile's first newly opened tab.** Like `files`, an entry's `in` names the tab whose cwd a relative path resolves against; omitted, it falls back to the profile's first newly opened tab (`defaultLabel`). When the profile opened nothing and no `in` is given there is no tab to resolve against, so the entry is skipped with a note — matching `openProfileFiles`. A `$root`/`~`/absolute path does not depend on any tab, but the entry still needs a resolving label for the note-append site, consistent with the files precedent.

4. **A missing file opens an empty new-file buffer.** When the resolved path does not exist on disk, the editor opens on an empty buffer that is not written until the user saves — the exact behavior of `edit <newfile>` today. No launch-time existence check and no skip; the user preferred consistency with `edit` over a "skip with a note" guard.

5. **Optional line targeting.** An entry may carry a `line` number; the editor opens with the cursor on that line, reusing the `line` parameter `openFile.edit` already accepts (the `edit <file>:<n>` path). Omitted, the editor opens at line 1.

6. **Editor tabs join the profile group, focus by the resolver.** Each editor tab is created like any other main-area view tab — placed contiguously in the profile's group with a distinct dot color (the editor opener's existing placement). It does **not** automatically steal focus the way a hand-typed `edit` does during launch; focus is decided once, by the main-area focus resolver in Decision 7.

7. **Generalized main-area focus model.** Focus is resolved per application area (left sidebar, right sidebar, main, monitors). A `focus: true` flag is added to the shared `tab` presentation object used by agent, harness, and editor entries, so any main-area entry can claim focus. After every entry and every editor tab is open, the main area's active tab is chosen as the entry with `focus: true` and the **lowest** tab `number`; ties fall to the lowest number. When no main-area entry declares focus, the launch retains today's invariant and lands on the first newly opened tab. The sidebar areas keep their existing focus mechanisms (`notifications.focus`, file-tree docking), unchanged.

8. **`profile save` captures the focused main-area tab and skips editor tabs.** Save writes `focus: true` onto the `tab` object of whichever main-area tab is currently active (its agent or harness entry) and omits the flag on the rest, so a saved-then-relaunched profile lands where the user left off. Editor tabs themselves are **not** captured — a text-editor tab is already in `profile save`'s "left out" list and is reported among the skipped tabs — so `editors` stays a hand-authored, launch-only key. This keeps save's editor behavior exactly as it is today while completing the focus round-trip.

9. **Relaunch reuses the editor's own dedup.** Re-running `profile launch` reopens each `editors` entry; the editor opener already focuses an existing tab rather than duplicating when the same file is opened again (editor-tab spec), and moves that tab's cursor to the requested line. Editor tabs are never persisted and are not restored by `--relaunch`; the profile file remains the single source of truth, recreating them on the next launch.

10. **`features` profile opens the backlog.** `profiles/features.json` gains an `editors` entry opening `product/backlog/features.md`, written as `$root/product/backlog/features.md` so it targets the project root regardless of which harness tab is first.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How it's reused |
|---|---|---|
| Profile-level tab opener pattern | `src/profile/files.ts` `openProfileFiles(files, managers, defaultLabel, notes)` | The new `openProfileEditors` is modeled on it line-for-line: iterate entries, resolve `label = entry.in ?? defaultLabel`, skip-with-note when undefined, otherwise open the tab and push a note. |
| In-app editor launch | `src/open-file-manager.ts:26` `edit(command, target, label, line?)` — expands `$root`/`~` via `expandUserPath` against `managers.tab.launchDir`, resolves relative paths against the tab's cwd, opens an empty buffer for a not-yet-existing path | Called directly by `openProfileEditors` with the entry's `path`, resolving label, and `line`; it already provides Decisions 2, 4, and 5. |
| Opener-registry tab placement | `src/openers/editor.ts` (via `openFile.edit`) — places the editor tab in the active group with a distinct dot color, and focuses/dedups an already-open file | Provides Decision 6's placement and Decision 9's relaunch dedup with no new code. |
| Loaded/typed profile plumbing | `src/types.ts` `ProfileFilesEntry`, `ProfileFile.files`, `LoadedProfile.files`; `src/profile-file.ts` `file.files ?? []`; `src/profile-schema.ts` `filesProblems` + `sectionProblems(root, 'files', …)` | The `editors` key threads through the identical five points; the `tab` presentation object and its validator (`tabProblems`) already exist and only need a `focus` field added. |
| Launch orchestration + default focus | `src/profile/agent-opener.ts` `openProfileEntries` — sets `setActiveTab(firstNew)`, then calls `openProfileFiles`, `openProfileNotifications`, `openProfileSchedules`, `applyProfileLayout`, `startProfileMonitors` in order | `openProfileEditors` is inserted right after `openProfileFiles`; the bare `setActiveTab(firstNew)` is replaced by the focus resolver (Decision 7), which falls back to `firstNew` when nothing claims focus. |
| Tab presentation round-trip | `src/profile-file.ts` `mapAgent`/`mapHarness` (tab → flat fields); `src/profile/save-entries.ts` `writeAgentEntry`/`writeHarnessEntry` (flat → `tab`) | Both gain the `focus` field alongside the existing `color`/`number`/`group`/`groupColor` mapping, so the flag survives load and save. |
| Save routing + skipped-tab list | `src/profile/save.ts`, `src/profile/save-route.ts` — routes each tab by its `view`, already lists a text-editor tab among skipped | Save adds `focus: true` to the active main-area entry (Decision 8); editor tabs keep landing in the skipped list with no change. |

## Proposed changes

**Types — `src/types.ts`.** Add a `ProfileEditorsEntry` type: `path` (required string), `in` (optional string), `line` (optional number), and `tab` (optional, the existing tab presentation shape). Add a `focus` (optional boolean) field to the tab presentation object that agent, harness, and editor entries share. Add `editors?: ProfileEditorsEntry[]` to `ProfileFile` and `editors: ProfileEditorsEntry[]` to `LoadedProfile`. Add a flat `focus?: boolean` to the runtime shapes the loader produces (`AgentState`'s tab-derived fields and `ProfileHarnessEntry`) so the resolver can read it uniformly.

**Schema — `src/profile-schema.ts`.** Add an `editorsProblems(value, loc)` predicate checking `path` (required string), `in` (string), `line` (number), and the nested `tab` via the existing `tabProblems`. Wire it in through `sectionProblems(root, 'editors', editorsProblems)` inside `collectProfileProblems`. Add a `focus` boolean check to `tabProblems` so a malformed `focus` is a structural problem on any entry that carries a `tab`. A structurally valid `editors` entry naming a missing file is not malformed — it launches and opens an empty buffer (Decision 4).

**Loader — `src/profile-file.ts`.** Return `editors: file.editors ?? []` from `loadProfile`. Extend `mapAgent`/`mapHarness` to carry `focus: tab?.focus` into their flat runtime fields, next to `dotColor`/`number`/`group`.

**New module — `src/profile/editors.ts`.** Export `openProfileEditors(editors, managers, defaultLabel, notes)`, mirroring `openProfileFiles`. For each entry: resolve `label = entry.in ?? defaultLabel`; if undefined, push a "no tab to root it at" note and continue; otherwise call `managers.openFile.edit` with a synthetic `edit <path>` command string, the entry's `path`, the resolved `label`, and the entry's `line`, then push an "Opened editor tab" note. It reports, per opened editor, the resolved tab label plus the entry's `tab.number`/`tab.focus`, so the focus resolver can consider editor tabs alongside agent/harness entries. Keep the module under the 200-line limit (it is small).

**New module — `src/profile/focus.ts`.** Export a pure helper that, given the list of main-area candidates (each an entry's `{ label, number, focus }` for agents, harnesses, and the just-opened editors) and a `firstNewLabel` fallback, returns the label to activate: the `focus === true` candidate with the lowest `number`, or the fallback when none claims focus. A second, effectful caller in `agent-opener.ts` maps that label to an index via `managers.tab.findIndex` and calls `setActiveTab`. Splitting the decision out keeps it unit-testable and keeps `agent-opener.ts` under the line limit.

**Orchestration — `src/profile/agent-opener.ts`.** Collect each opened agent/harness entry's `{ label, number, focus }` as they open (the loop already computes `labelOf(entry)` and has the entry in hand). After `openProfileFiles`, call `openProfileEditors(loaded.editors, managers, firstNewLabel, notes)` and fold its opened-editor descriptors into the candidate list. Replace the current unconditional `setActiveTab(firstNew)` with the focus resolver so the active main-area tab is chosen once, after every main-area tab (including editors) is open and before monitors start. Editors open before notifications/schedules/layout/monitors so a monitor target that names an editor tab still resolves.

**Save — `src/profile/save-entries.ts` and `src/profile/save.ts`.** In `writeAgentEntry`/`writeHarnessEntry`, set `focus: true` on the `tab` object when that tab is the currently active main-area tab, and leave it unset otherwise (so `JSON.stringify` drops it). The active-tab identity comes from the tab manager's active index. Editor tabs remain unrouted to any entry accumulator and continue to be reported among skipped tabs — no change to that path.

**Profile file — `profiles/features.json`.** Add an `editors` section opening the backlog:

```json
"editors": [
  { "path": "$root/product/backlog/features.md" }
]
```

**Spec + docs.** Add a "Profile-level editor tabs" section to `product/specs/profiles.md` describing the `editors` key, its entry shape (`path`, `in`, `line`, `tab`), path resolution, the missing-file/empty-buffer behavior, and the relaunch dedup. Update that spec's focus wording and the `profile save` section to describe the generalized main-area `focus` flag and its capture. Cross-reference `product/specs/editor-tab.md` where it lists how editor tabs are opened (add profile launch as an origin). Check `documentation/user-documentation/` for a profiles page and mirror the new key there if one exists.

## Tests

- `src/profile/editors.test.ts` (new): an `editors` entry opens an editor tab on the resolved path (mirroring `files.test.ts` structure); a `$root/...` path resolves against the launch dir independent of the resolving tab; a relative path resolves against the `in` tab's cwd; a `line` is passed through to the editor; an entry with no `in` when the profile opened nothing is skipped with a note; a missing file still opens (empty buffer), asserted via the `openFile.edit` call rather than an on-disk read.
- `src/profile/focus.test.ts` (new): the resolver picks the lowest-numbered `focus: true` candidate across mixed agent/harness/editor candidates; falls back to `firstNewLabel` when none claims focus; and handles a single claimant and an empty candidate list.
- `src/profile-schema.test.ts` / `src/profile/validate.test.ts` (extend): a well-formed `editors` array validates; `path` missing or non-string, `line` non-number, `in` non-string, and a non-boolean `tab.focus` each report a located problem; a valid `editors` entry naming a nonexistent file is **not** a structural problem.
- `src/profile-file.test.ts` (extend): `loadProfile` returns `editors` and carries `tab.focus`/`tab.number` into the flat runtime fields for agents and harnesses.
- `src/profile/agent-opener.test.ts` (extend): editors open after entries and before monitors; the active tab after launch is the lowest-numbered `focus: true` main-area tab; with no focus declared, the active tab is the first newly opened entry (unchanged behavior).
- `src/profile/save.test.ts` (extend): saving a session writes `focus: true` on the active main-area tab's entry and omits it on the others; an open editor tab is reported among skipped tabs and produces no `editors` key.

## Out of scope

- **Capturing editor tabs on `profile save`.** `editors` stays a hand-authored, launch-only key; a running editor tab is not written back into the profile (Decision 8). Round-tripping open editor tabs could be a later addition.
- **Docking an editor tab into a sidebar.** Editor tabs are main-area tabs only; `dock` has no meaning for an `editors` entry and is not part of its schema. Only file-tree, notifications, and schedules tabs dock.
- **Wildcards / multiple files per entry.** Each `editors` entry names exactly one file. A glob that fans out to several editor tabs (as `open <pattern>` does on the command line) is not supported here; author one entry per file.
- **External presentation.** `editors` always opens the in-app editor; there is no profile-level equivalent of `open external`.
- **A `focus` field on sidebar/monitor entries beyond what exists.** This plan generalizes focus for the **main** area and reuses the existing `notifications.focus` and docking behavior for the sidebars; it does not add new focus controls to file-tree or schedules entries.

## Open questions

None.

## Verification

- Run `./scripts/run.mjs check-diff` and confirm lint, typecheck, and the server tests for the changed files all pass.
- Manual check: run `profile launch features` and confirm an editor tab opens on `product/backlog/features.md` in the profile's group, that the launch still lands on the first harness tab (no `focus` declared on any entry), and that re-running `profile launch features` focuses the existing editor tab rather than opening a second one. Add `"tab": { "number": 3, "focus": true }` to the editors entry and confirm the launch now lands in the editor tab; add a second editor entry with a lower number and `focus: true` and confirm the lower-numbered one wins. Point an `editors` entry at a path that does not exist and confirm it opens an empty buffer that writes the file on first save.
