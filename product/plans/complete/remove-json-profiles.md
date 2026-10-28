# Remove JSON profiles

**Complexity: 6/10.** Most of the code goes as one block: `src/profile/` holds a JSON loader, a validator, and a launcher that opens harness, editor, navigator, plugin, ssh, and notifications tabs and applies monitors and a layout. Around it sit four hooks built only for that launcher (`HarnessManager.openFromProfile`, the `placeProfileTabs` chain in `src/tab/`, `FileNavigatorManager.restoreView`, and the plugin declaration field `profileCommand`). The width is in the text. About forty specs, documentation pages, and code comments describe JSON profile entries, and the profile spec and user page need rewriting around runscripts.

## Goal

Profiles are runscripts only. `profile launch <name>` runs `profiles/<name>.rs` from the project, or from the Janissary installation when the project has none. Nothing reads `profiles/<name>.json` any more. `profile list` and the picker list only `.rs` names. A name with only a `.json` file is an unknown name: `profile launch <name>` answers `No profile named "<name>".`, and the name is not listed.

The JSON launcher's messages go with it: `Profile "<name>" is malformed.`, `Profile "<name>" has no tabs.`, and the `Launched profile "<name>": …` report. `Profile command failed: <reason>.` stays, because a runscript launch that rejects reports through it. Writing JSON profiles is already gone: `profile save` was removed in #1817, and nothing else writes a profile.

## Approach

`ProfileManager.run` asks `resolveProfile` for a runscript and hands it to `launchProfileRunscript`. Everything behind the other branch, `loadProfile` and `openProfileEntries`, is deleted, along with the modules only they reach. `src/profile/` keeps `command.ts`, `manager.ts`, `runscript.ts`, `types.ts` (cut to `ProfileRow` and `ProfileParsed`), and `inherited-cwd.ts`. That last file is used by `src/plugins/launch-tab.ts`, and the profile feature never used it.

The four launcher-only hooks outside `src/profile/` have no other caller, so each is deleted rather than detached. Two helpers were shared with remaining features and move or stay. `oneShotRunEntry` moves to `src/harness/`. `normalizeWebUrl` stays in core.

### Scope decisions

1. **Boundary.** JSON loading, validation, and launching go, along with every behavior that exists only for JSON entries. That means each entry kind and its fields, the relaunch reset, a launch forming its own group, `number`/`pane`/`focus` placement, tree-view restore, profile-level `monitors` and `layout`, and the launch report. `profile launch`, `profile list`, the picker, runscript profiles, and the project-over-installation override stay.
2. **Monitors: docs only** (Q1, revised by Q9). `MonitorManager.start` keeps its optional `name` parameter. The name/persona split in records, on the wire, and in the client display is untouched. So are the six monitor tests that start a monitor under a custom name. Only profile wording leaves the monitoring spec, user docs, and code comments.
3. **`profileCommand` removed with no API bump** (Q2). Delete it from `TabPluginDeclaration` in `src/plugins/api.ts` and from the shell manifest. `TAB_PLUGIN_API_VERSION` stays 2. The field was optional, only bundled plugins exist, and the host simply stops reading it. Per the task, the contract shrinks with no deprecation window, shim, or warning.
4. **Reorder and group-completion tests deleted** (Q3, Q14). Two tests in `src/controller.test.ts` used a JSON profile only to put a tab in another group. `will not reorder a tab across a group boundary` (group 2) is deleted. So is `complete() offers a group: target for each existing group once more than one exists` (group 7), which was found during removal. The `writeWriterProfile` helper goes with them.
5. **Screenshot fixture converted** (Q4). `scripts/docs-screenshots/fixtures/profiles/demo.json` becomes `demo.rs`, reproducing its two colored editors in group 1 with `tides.ts` focused. The `profile-group` and `tabs-groups` definitions in `scripts/docs-screenshots/manifest.mjs` stay. Their PNGs are not regenerated in this change.
6. **`oneShotRunEntry` moves** (Q5, Q13). It moves to a new `src/harness/one-shot-run.ts`, and its one test moves unchanged to `src/harness/one-shot-run.test.ts`. `src/profile/harness-schedule.ts` and its test are deleted.
7. **`normalizeWebUrl` stays in core** (Q6). Only the header comment of `src/openers/web-target.ts` changes, so it no longer cites profile relaunch. Its ESLint host-utility allowance stays.
8. **User page and help rewritten for runscripts** (Q7). The page keeps its intro, list, and picker sections. It replaces "Writing a profile", "Relaunching", and the JSON worked example with runscript ones, and fixes the bundled list to `debugging`, `default`, `features`, `planning`, `product-review`.
9. **Other mentions: cut JSON-only text** (Q8). In specs, docs, and code comments, delete or reword text about JSON entry behavior: fields, entries, own group, relaunch reset, view restore, ssh options, `run`/`schedule` entries, and a profile launch's issuing tab. Keep lines that stay true for a runscript, such as "a profile can still open one" or "an address can arrive from a profile file on disk".
10. **Harness tests: delete and trim** (Q10). Delete the 15 tests of profile-entry handling and the 3 that used `openFromProfile` only as a launch vehicle. In the 2 mixed tests, delete the `openFromProfile` assertion and lower the counts that included it.
11. **`resolveProfile` returns the path** (Q11). It returns the runscript's path or `undefined`. `ProfileSource` is deleted.
12. **Listing tests converted to `.rs`** (Q12). Three listing tests switch their fixtures to `.rs` with the same assertions. The two runscript tests drop their stray `.json` lines. One new test pins that a `.json`-only name is neither listed nor resolved.
13. **Dock focus kept** (Q15, found during removal). The `layout` event's `focusLeft`/`focusRight` fields had one producer, the profile `notifications` entry's `focus`. The fields, the client's `useLayoutState` state, the props down to `Sidebar`'s `focusView`, and their tests stay untouched. Only the comments that cite a profile change.
14. **Already decided by the task.** A `.json`-only name behaves as if it never existed. `profiles/*.json` files already on users' machines are tolerated and ignored, never migrated or cleaned up. Completed plans and `CHANGELOG.md` are not edited.

No remaining feature is built around JSON profiles. No backlog entry concerns them: the "workflows" entry in `product/backlog/features.md` mentions `profiles/` only for comparison and stays.

## Implementation steps

1. **Profile command.**
   - `src/profiles.ts`: delete `profilePath`, `profileReadPath`, and `ProfileSource`. `resolveProfile(name)` returns the project's `<name>.rs` path, else the installation's, else `undefined`, still checking presence with `lstat` so a symlinked `.rs` claims its name. `listProfileDir` lists only `*.rs`. Reword the header comment.
   - `src/profile/manager.ts`: `run` resolves a runscript and launches it. Drop the `loadProfile`/`openProfileEntries` imports and branch.
   - `src/profile/types.ts`: keep `ProfileRow` and `ProfileParsed` and delete every other type.
   - `src/profile/command.ts`: its comment's "file-loading helpers" becomes the directory lookups left in `profiles.ts`.
   - Delete from `src/profile/`: `agent-opener`, `editors`, `entry-openers`, `entry-resolve`, `file`, `files`, `focus`, `harness-schedule`, `layout`, `monitors`, `notifications`, `schema`, `schema-fields`, `schema-tab-entry`, `view-tabs` (each `.ts` and its `.test.ts` where one exists), and `view-tabs-shell.test.ts`.
2. **Harness.**
   - New `src/harness/one-shot-run.ts` with `oneShotRunEntry`, and `src/harness/one-shot-run.test.ts` with its moved test.
   - `src/harness/manager.ts`: import `oneShotRunEntry` from the new module. Delete `openFromProfile`, the `ProfileHarnessEntry` import, and any import left unused.
   - `src/launch-name/local.ts`: delete `LAUNCH_REFUSED` and its comment.
3. **Tabs.** Delete `src/tab/place-profile-tabs.ts` and its test, `placeProfileTabSelection` in `src/tab/split-selection.ts`, `placeProfileTabs` in `src/tab/operations.ts`, and `TabManager.placeProfileTabs` with its import.
4. **File navigator.** Delete `FileNavigatorManager.restoreView`, plus `restoreTreeView` and `SavedTreeView` in `src/file-navigator/restore.ts` with the imports only they used. `stillDirectory` and `nextRestoreRevision` stay for `restore-command.ts`. Delete `src/file-navigator/restore.test.ts`, which tests only `restoreTreeView`.
5. **Plugin contract.** Delete `profileCommand` from `src/plugins/api.ts` and `src/plugins/shell/manifest.ts`, with their comments.
6. **Code comments** (decision 9). Reword or cut the JSON-entry text in the comments of the files below. Kept text that stays true for runscripts is left alone.
   - `src/openers/web-target.ts`, `src/window-resizer.ts`, `src/protocol/events.ts`, `src/protocol/tab.ts`, `src/tab/types.ts`
   - `src/harness/spawn-options.ts`, `src/harness/launch-dir.ts`, `src/harness/auto-approve.ts`, `src/workspace/provision-wire.ts`
   - `src/launch-name/local.ts`, `src/launch-name/check.ts`, `src/launch-name/fail-remote.ts`, `src/remote/address.ts`
   - `src/open/file-manager.ts`, `src/open/launch-dir-branch.ts`
   - `src/file-navigator/manager.ts`, `src/file-navigator/open-command.ts`, `src/file-navigator/navigation.ts`, `src/file-navigator/state.ts`, `src/file-navigator/restore.ts`
   - `src/monitor/manager.ts`, `src/monitor/window.ts`, `src/monitor/parsing.ts`, `src/commands/monitor.ts`, `src/completion/handlers.ts`
   - `src/schedule/manager.ts`, `src/plugins/page/activate.ts`, `src/plugins/sql/shared.ts`
   - `web/src/file-navigator/file/navigator-selection-registry.ts`, `web/src/useLayoutState.ts`, `web/src/Sidebar.tsx`, `web/src/ReportingSection.tsx` (the last three found during removal, covered by decision 9)
7. **Help.** In `help/profile.md`, "Reopen an arrangement of tabs and settings from a profile file." and "Run a profile's runscript, `profiles/<name>.rs`, instead of opening its tabs." become one use case: "Run a profile's runscript, `profiles/<name>.rs`, to set up tabs and settings." `help/commands.md` is unchanged.
8. **Specs** (see Spec updates).
9. **User and developer documentation.**
   - `documentation/user-documentation/automation/profiles.md`: rewritten per decision 8. "Writing a profile" explains a `profiles/<name>.rs` runscript (one command per line, blank and `#` lines skipped, run in the system shell like `execute`, nothing printed, project over installation, the symlink refusal). It replaces the JSON worked example with a runscript one. "Relaunching" and every JSON example and field list are deleted. The screenshot caption describes what it shows: two editor tabs the profile's runscript opened.
   - `getting-started/groups.md`: delete the "Profiles get their own group" bullet and the `groupName` sentence.
   - `automation/scheduling.md`: drop "Profiles can pre-author a harness tab's schedule…".
   - `automation/monitoring.md`: drop "A profile can give a monitor a name of its own…". The restart line reads "or from a profile whose runscript starts them".
   - `tab-types/file-navigator.md`: the detail-mode sentence and the "open a local tree with a view already in place" paragraph describe the `files` command's own clauses instead of a profile entry.
   - `tab-types/editor-git-sync.md`: drop "a profile restore".
   - `tab-types/markdown-preview.md` and `tab-types/conversations.md`: a profile can reopen a preview or the conversation list, rather than record or restore one.
   - `advanced-agents/harness.md`, `getting-started/tabs.md`, `tab-types/*.md`, and the remaining pages: reword under decision 9 wherever the text describes a JSON entry.
   - `documentation/developer-documentation/tab-plugins.md`: delete the `profileCommand` row and "or by a profile entry carrying `dock`". The `profileCommand` sentence under "API changelog › v1" is a historical record and stays; no v2 changelog entry is added (Q16, found during removal).
   - `ai/guidelines/plugins-tabs.md`: Docking drops "and a profile entry may name the side to dock it to".
10. **Screenshot fixture.** Replace `scripts/docs-screenshots/fixtures/profiles/demo.json` with `demo.rs`:
    ```
    edit $root/src/app.ts
    tab color app.ts #5b9cff
    tab group app.ts 1
    edit $root/src/tides.ts
    tab color tides.ts #ff9f43
    tab group tides.ts 1
    tab focus tides.ts
    ```

No documentation page is deleted, so the docs-site sidebar is unchanged.

## Tests

- **Deleted with the code:** the `.test.ts` files of every deleted `src/profile/` module, `src/profile/view-tabs-shell.test.ts`, `src/tab/place-profile-tabs.test.ts`, and `src/file-navigator/restore.test.ts`.
- **Moved:** `oneShotRunEntry` › `builds an entry that fires once, immediately` goes to `src/harness/one-shot-run.test.ts`.
- **`src/profiles.test.ts`:**
  - Delete `resolves profilePath/resolveProfile to the file`, `reads a built-in profile when no project profile has the same name`, `reads the project profile when both sources use the same name`, `resolves a runscript over a JSON file of the same name`, `lets a project JSON file override a built-in runscript`, and the five `loadProfile` tests.
  - Convert `lists profile files (extension stripped) sorted`, `lists project profiles before built-in profiles and lets project names override`, and `never lists a subdirectory of profiles/ as a row` to `.rs` fixtures, keeping their assertions.
  - The kept resolve tests expect a path instead of `{ kind, file }`. `treats a symlink…` and `lists a runscript-only profile…` drop their `.json` lines.
  - New: a `.json`-only name is neither listed nor resolved.
- **`src/profile/manager.test.ts`:** delete `reports an existing profile that has no tabs`, `reports an empty tabs array as having no tabs`, `launches a profile holding only an editor entry rather than calling it empty`, `reports a malformed profile and opens nothing`, `reports an unrecognized tab type as malformed`, and `reports a rejected profile launch in the issuing transcript`. The two runscript tests with a `.json` beside them pass unchanged, now as proof that the `.json` is ignored.
- **`src/controller.test.ts`:** delete `a launched profile forms its own group, distinct from the root`, `honors a group number authored on a profile entry`, `will not reorder a tab across a group boundary`, `complete() offers a group: target for each existing group once more than one exists`, the `Controller profile launch (harness entries)` describe, and `writeWriterProfile`.
- **`src/harness/manager.test.ts`:**
  - Delete the 18 tests that launch through `openFromProfile`, as listed in decision 10. The 15th profile-entry test, `opens a profile entry with browser %s…`, was found during removal.
  - In `keeps typed and profile explicit-name clashes as refusals`, delete the `openFromProfile` assertion. Its count of two `quality` tabs stays, because it includes the tab the test seeds.
  - In `refuses a -w label that climbs out of the workspace base…`, delete the `openFromProfile` assertion and expect `notify` called once rather than twice.
- **`src/tab/manager.test.ts`:** delete `places a profile batch and selects its lowest-numbered tab in each pane`.
- **`src/file-navigator/manager.test.ts`:** delete the three `restoreView` tests in `profile capture and restore`.

## Spec updates

- `product/specs/profiles.md`: rewritten for runscripts. Keep the overview, Storage (project then installation, `.rs` only, the symlink claim), Runscript profiles (without the `.json` comparisons), the picker, `profile list` (`.rs` names), and the `profile` command (usage and `Profile command failed: <reason>.`). Delete the harness-entry fields, Malformed profiles, monitors, file navigator, restoring a tree's view, editor, plugin/page/ssh, notifications, schedules, layout, relaunching, name clashes, grouping, and group names.
- `product/specs/tabs.md`: delete the "Profiles form a group" bullet and the `groupName` sentence.
- `product/specs/scheduling.md`: delete "Authored schedules in a profile". "typed by a user or authored in a profile" and "the same one-shot mechanism a profile's `run` entry uses" are reworded.
- `product/specs/file-navigator-tab.md`: delete "Restoring a tree's view from a profile" and the "Profile launch retains…" sentence. Reword the remote-tree restore mention.
- `product/specs/harness.md`: drop each profile-entry clause (`name`, `browser: true` field, `run` entry, the profile's own group, `schedule`/`run` entries, launch via `profile launch` with the entry schema, a profile pinning a model).
- `product/specs/remote-server.md`: drop "a profile entry's name", "or a profile launch's issuing tab", and "through a profile" from the restore list. Lines true for runscripts stay.
- `product/specs/monitoring.md`: drop "A profile may give a monitor a name of its own…".
- `product/specs/tab-plugins.md`: delete the `profileCommand` paragraph and "A profile entry can dock a plugin tab…". The docking means become the dock control and the plugin itself.
- `product/specs/ssh-tab.md`: the profile `ssh` entry paragraph goes.
- `product/specs/editor-tab.md`: delete the "Profiles may also open an editor tab through their `editors` configuration" paragraph.
- `product/specs/sidebars.md`: "unless a profile applies/a profile's layout" becomes the `layout` command.
- `product/specs/notifications.md`, `workspaced-agent.md`, `root-path.md`, `conversations.md`, `image-tab.md`, `pdf-tab.md`, `video-tab.md`, `audio-tab.md`, `markdown-tab.md`, `embedded-web-page.md`: cut or reword the JSON-entry clauses under decision 9, keeping "a profile can still open one".

## Verification

**Fast check** after each step: `$janissary/scripts/run.mjs check-diff`.

**Full checks** once removal is done, each as green as the baseline (typecheck clean; lint 0 errors, 14 warnings; tests 1005 files, 14355 passed, 1 skipped): `npm run typecheck`, `npm run lint`, `npm test`. Documentation pages are edited, so `npm run docs:build` must also pass. `npm run check` is not run.

**Dead-code baseline** (`npm run knip`, before any removal). Every finding here is pre-existing and left alone; any finding the removal adds is removed:

```
Unused files (2)
src/plugins/file-capabilities.ts
src/search/matcher-worker-entry.ts
Unused exports (7)
AGENT_MONITOR_SCHEMA_VERSION            src/plugins/agent-monitor/shared.ts:1:14
isModelPair                             src/plugins/api.ts:470:10
inheritGroupName              function  src/tab/groups.ts:65:17
RemoteChip                              web/src/plugins/api.ts:72:10
diffIcon                                web/src/plugins/api.ts:94:145
dragging                      function  web/src/plugins/roles/roles-dnd.ts:44:17
diffIcon                                web/src/shared/icons.ts:39:19
Unused exported types (6)
EffortLevel           type  src/harness/effort-levels.ts:8:13
TabPluginLaunchReady  type  src/plugins/api.ts:40:27
RunscriptRowView      type  src/protocol.ts:95:15
AgentRunUpdatedEvent  type  src/protocol.ts:138:3
AppTerminal           type  web/src/plugins/api.ts:65:34
AppTerminalOptions    type  web/src/plugins/api.ts:65:52
Duplicate exports (1)
HARNESS_CLONE_DEPTH|AGENT_CLONE_DEPTH  src/workspace/clone-depth.ts
Configuration hints (1)
src/plugins/search/matcher-worker-entry.ts    knip.json  Remove from ignore
```

Line numbers in `src/plugins/api.ts` may shift when `profileCommand` goes. A finding is matched by name and file.

**Live check** of the detached features, in a scratch instance driven through the attached browser. The scratch project gets `profiles/notes.rs` (`edit $root/notes.md`), `profiles/legacy.json` (one `editor` entry), `notes.md`, and the docs-screenshot `src/app.ts`, `src/tides.ts`, and `profiles/demo.rs`.

- `profile list` lists `demo` and `notes` before the built-in profiles, and not `legacy`.
- `profile launch legacy` answers `No profile named "legacy".` and opens no tab.
- `profile launch notes` opens a `notes.md` editor tab.
- `profile launch demo` opens `app.ts` and `tides.ts` editor tabs with `tides.ts` active, the converted screenshot fixture.
- `shell` opens a shell tab, with the shell plugin's manifest now lacking `profileCommand`.
- `files expand src cursor src/app.ts select src/app.ts` opens a tree with `src` expanded and `src/app.ts` selected, the view clauses whose restore module was trimmed.
- `harness … with <prompt>`, whose one-shot entry moved: a launch shows a `run-1` one-shot in its schedule. If the scratch environment cannot start a harness, this check is recorded as not possible with the reason, and the unit tests remain its evidence.

### Results

- Fast check green after every step.
- Full checks as green as the baseline: typecheck clean; lint 0 errors, 14 warnings; tests 990 files, 14142 passed, 1 skipped. The 15 fewer files are the 16 deleted test files less the one new `src/harness/one-shot-run.test.ts`. `npm run docs:build` passed.
- Dead-code scan after removal: identical to the baseline above, with `isModelPair` moved from line 470 to 467 of `src/plugins/api.ts`. No new finding to remove. A by-name search of every symbol the deleted code imported found each still used by production code.
- Live check: passed in a scratch instance built from the working tree, with both browser variables present. The build changed no tracked file.
  - The activity log shows `profile list` answering `demo`, `notes`, `debugging`, `default`, `features`, `planning`, `product-review`, with no `legacy`.
  - `profile launch legacy` answered `No profile named "legacy".` and opened no tab.
  - `profile launch notes` opened a `notes.md` editor tab showing the file.
  - `profile launch demo` opened `app.ts` (blue) and `tides.ts` (orange) in group 1, with `tides.ts` active. Unlike the old JSON launch, the runscript appends them after `janus`, so a regenerated `profile-group` PNG would show `janus` first.
  - `shell` opened a shell tab.
  - `files expand src cursor src/app.ts select src/app.ts` opened a tree with `src` expanded and `app.ts` selected.
  - `harness claude as live --no-workspace --no-auto-approve --no-browser with hello there` opened `live`, and `schedule list in live` answered `run-1  once  (next: Oct 28 2:24pm)  hello there`.
  - The launch shell does not render text replies in its tab body, so the activity log is the evidence for `profile list` and `profile launch legacy`.
  - The app shut itself down when the driver disconnected; the stop command reported no running instance, and the scratch root was removed.

## Out of scope

- Monitor naming code, its wire fields, its client display, and its tests (decision 2).
- Bumping `TAB_PLUGIN_API_VERSION` (decision 3).
- Moving `normalizeWebUrl` or `src/profile/inherited-cwd.ts` (decision 7; the latter is not part of the feature).
- Regenerating the `profile-group` and `tabs-groups` PNGs.
- Migrating, cleaning up, or warning about `profiles/*.json` files already on disk.
- Test titles in kept tests that still mention JSON, such as `runs the runscript instead of opening the tabs of the JSON file beside it`. This task may only delete assertions about the removed feature, beyond the edits the user approved above.
- Pre-existing staleness unrelated to JSON entries, such as `product/specs/cli.md` listing `profiles` among `.janissary/` subdirectories.
- Completed plans in `product/plans/complete/` and `CHANGELOG.md`, which are historical records.
