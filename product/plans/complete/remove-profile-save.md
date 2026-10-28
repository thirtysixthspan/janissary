# Remove `profile save`

**Complexity: 4/10** — the command's own code is one self-contained directory (`src/profile/save/`) plus one parser branch and a save queue in `ProfileManager`. The width is in the text around it. About twenty specs, user-documentation pages, and code comments explain a launch-side field or a shared mechanism in terms of what `profile save` writes, and each needs rewording rather than deletion.

## Goal

Remove the `profile save <name>` subcommand. After this change, `profile save <name>` is an unknown subcommand. It gets the same top-level usage line as `profile bogus`: `Usage: profile launch <name> | profile list | profile validate [<name>]`. Nothing in Janissary writes a profile file any more. A profile is a file you author by hand, and `profile launch`, `profile list`, and `profile validate` behave exactly as before.

## Approach

Everything that exists only to capture a running session lives in `src/profile/save/` (`index.ts`, `entries.ts`, `reserved.ts`, `route.ts`, and their tests), reached through one import in `src/profile/manager.ts`. Deleting that directory, the `save` branch and save queue in `ProfileManager`, and the `save` parse in `src/profile/command.ts` removes the command.

The mechanisms save drew on are shared with features that stay, so they are kept and only their comments change:

- The client's size report (`reportLayout` RPC, `src/client-layout.ts`, `web/src/useLayoutState.ts`) and the window-bounds reader (`getWindowBoundsReader` in `src/window-resizer.ts`, `src/cdp-window-resize.ts`) are also read by bare `layout`.
- The tree-selection request (`requestTreeSelections` in `src/file-navigator/selection-request.ts`, the bus `collect` event, and the client collectors) is also used by `files print`.
- `abbreviatePath`, `atomicWriteFile`, `tabGroupName`, `centerPane`, `LAUNCH_LABEL`, `SYNC_WORKSPACE_NAME`, and `profilePath` all have other callers.

Every field `profile launch` reads stays hand-authorable. That includes the fields that mostly existed so a save could round-trip: the `files` entry's `expanded`, `cursor`, `anchor`, `selected`, and `details` keys, `groupName`, `browser`, `layout`, and `monitors`. The loader (`src/profile/file.ts`) and schema are unchanged, so a profile saved before this change still launches.

### Scope decisions

1. **Boundary — save command only.** Remove `profile save` and the code that serves nothing else. The launch-side round-trip fields listed above stay.
2. **Accessors kept.** `FileNavigatorManager.detailOf` (with `detailOfTab` in `src/file-navigator/manager/profile.ts`) and `MonitorManager.snapshot()` have no production caller once save is gone. `FileNavigatorManager.expandedPaths` (with `expandedPathsOf`) still has one: `files print` reads it in `printView`. Tests of remaining features observe through all three (command view restoration, detail modes, monitor naming), and this removal may not rewrite those tests, so the accessors stay. Only their comments change so they no longer cite `profile save`.
3. **`HarnessView.sshOptions` kept.** The field, the line in `src/ssh-manager.ts` that sets it, and its tests stay. Only its comment in `src/tab/types.ts` is reworded.
4. **Wording — reword to hand-authored.** Sentences that describe what save captures are deleted. Sentences that used save to explain a launch-side field are reworded to describe the hand-authored field. Code comments in kept code that cite `profile save` are reworded to name the consumer that remains, or the launch side.
5. **Two unlisted mentions, found during removal, reworded too.** `documentation/user-documentation/getting-started/design-principles.md` changes "Profiles let you capture a multi-tab setup" to "describe a multi-tab setup in a file". The Docking section of `ai/guidelines/plugins-tabs.md` changes "a profile may capture and restore the side it was docked to" to "a profile entry may name the side to dock it to".
6. **Already decided by the task.** `profile save <name>` behaves as if it never existed: it is an unrecognized subcommand and gets the top-level usage line. Profiles already on disk are tolerated, not migrated; this holds without a code change because the loader is untouched. Completed plans and `CHANGELOG.md` are not edited.

No remaining feature is built around save. Save is not an extension contract: it read plugin declarations (`fileExtensions`, `webTargets`), but those stay for the openers. No backlog entry concerns save.

## Implementation steps

1. **Command code.**
   - Delete `src/profile/save/` (`index.ts`, `index.test.ts`, `entries.ts`, `reserved.ts`, `route.ts`, `route.test.ts`).
   - `src/profile/manager.ts`: remove the `saveProfile`/`formatSaveSummary` import, `saveQueue`, `save`, `queueSave`, `runQueuedSave`, `ignoreFailure`, and the `save` branch of `run`. `finish` stays, because launch reports its failures through it.
   - `src/profile/command.ts`: remove the `save` branch. `PROFILE_USAGE` becomes `Usage: profile launch <name> | profile list | profile validate [<name>]`.
   - `src/profile/types.ts`: remove `{ action: 'save'; name: string }` from `ProfileParsed`. Reword the comments that cite the saver (the plugin-entry comment, the `monitors` element comment, and "the saver maps it back up" on the layout type).
2. **Tests of the profile command.**
   - `src/profile/command.test.ts`: delete `parses save with a name` and `reports usage for bare save`.
   - `src/profile/manager.test.ts`: delete the `profile save` call and its expected entry from `answers a launch or save with no name with that action's own usage`. Delete `reports a rejected profile save in the issuing transcript`, `serializes overlapping saves so their selection requests do not cancel each other`, and `continues the save queue after a rejected save`. Remove the `messageBus` and `resolveTreeSelections` imports, which only those tests used.
3. **Comments in kept code.** Reword each comment that cites `profile save` so it names the remaining consumer or the launch side:
   - `src/profile/file.ts`, `src/profile/view-tabs.ts`, `src/profile/schema.ts`
   - `src/file-navigator/restore.ts`, `src/file-navigator/selection-request.ts`, `src/file-navigator/manager.ts`, `src/file-navigator/manager/profile.ts`
   - `src/monitor/manager.ts`
   - `src/client-layout.ts`, `src/cdp-window-resize.ts`, `src/window-resizer.ts`
   - `src/bus.ts`, `src/protocol/events.ts`, `src/protocol/core-rpc.ts`, `src/protocol/tab.ts`
   - `src/tab/view.ts`, `src/tab/types.ts` (`sshOptions`, `browser`), `src/paths.ts`
   - `web/src/file-navigator/file/navigator-selection-registry.ts`, `web/src/shared/ws/client-state-collectors.ts`, `web/src/shared/ws/ws.ts`, `web/src/useLayoutState.ts`
4. **Help.**
   - `help/profile.md`: summary becomes "Launch a profile, list the available profiles, or validate one." Drop the `profile save <name>` usage line, the "Save the current session for later." use case, and the `profile save review` example. "Reopen a saved arrangement of tabs and settings." becomes "Reopen an arrangement of tabs and settings from a profile file."
   - `help/commands.md`: the `profile` row becomes "Use `profile launch <name>` to launch a profile, or bare `profile launch` to pick one. `profile list` and `profile validate [name]` list or check profiles".
5. **Specs** (see Spec updates).
6. **User documentation.**
   - `documentation/user-documentation/automation/profiles.md`: delete the "Saving the running session as a profile" section. Move its last sentence, for launch only, to the end of the Relaunching section: "If a launch fails partway, the issuing transcript receives `Profile command failed: <reason>.` so the command does not appear unfinished." Reword the remaining mentions:
     - the opening "a saved, named set" and "the entry's saved name";
     - the picker's "a profile you have just saved with `profile save`";
     - the directory paragraph: customize a built-in profile "by adding a same-named file to your project's `profiles/` directory", and Janissary does not create `profiles/`, so you add it yourself;
     - the `browser` and `cwd` bullets;
     - the `groupName` sentence;
     - the `layout` paragraph's last sentence;
     - the git-sync editor paragraph;
     - the `plugin` entry paragraph ("profiles you saved before" becomes "older profiles");
     - the notifications paragraph.
   - `command-bar/plugins.md`: "`profile save` records most plugin tabs and reopens them…" becomes a statement that a profile can reopen most plugin tabs by reissuing the same command you would type.
   - `tab-types/audio-player.md`: drop the "a saved profile records the audio tab…" clause.
   - `tab-types/file-navigator.md`: the detail-mode sentence and the "brings a **local** tree back" paragraph describe a `files` entry's view keys rather than what save records.
   - `tab-types/image-viewer.md`, `video-player.md`, `pdf-viewer.md`, `web-pages.md`: "a profile records/captures an open X tab" becomes "a profile can open an X tab by its file (or address)".
   - `getting-started/tabs.md`: "A saved profile can restore…" and "A profile can save and restore the widths" become a profile can *set* them.
   - `getting-started/groups.md`: "Profiles saved with group names keep those names" becomes a profile entry's `groupName`.
   - `getting-started/why-janissary.md`: "save multi-agent setups as profiles", "save it as a profile", and "Save and recreate multi-tab setups" are reworded. The last becomes "Recreate multi-tab setups from a file".
   - `getting-started/design-principles.md` and `ai/guidelines/plugins-tabs.md`, per decision 5.

No documentation page is deleted, so the docs-site sidebar, screenshots (`profile-group` only launches a profile), and `scripts/docs-screenshots/manifest.mjs` are unchanged.

## Tests

- Deleted with the feature: `src/profile/save/index.test.ts` and `src/profile/save/route.test.ts`.
- Assertions about save deleted from `src/profile/command.test.ts` and `src/profile/manager.test.ts`, as listed in step 2.
- No new test. `answers an unreadable command with the usage line and runs nothing` already pins that an unknown subcommand gets `PROFILE_USAGE`, which is what `profile save <name>` now gets.
- `src/commands.test.ts` reads `help/commands.md` through `help commands` and checks row order and help pages. The `profile` row keeps its place.

## Spec updates

- `product/specs/profiles.md`:
  - Delete the `### profile save <name>` section.
  - Storage: nothing creates `profiles/`, and reads still search project then installation. Drop "saves always write to the project directory".
  - `browser` bullet: drop the `profile save` sentence.
  - `autoResume` bullet: drop the sentence about a saved `--no-auto-resume` tab.
  - Editor entries: drop "(or captured by `profile save`)".
  - Legacy `image`/`markdown`: drop "`profile save` writes the `plugin` form".
  - Schedules: a `plugin` entry naming the schedules plugin means the same as `"type": "schedules"`.
  - Picker: drop "including by `profile save`".
  - `profile` command paragraph: drop save and "save or".
  - Group names: launch restores `groupName`.
- `product/specs/file-navigator-tab.md`: the remote-tree sentence drops "omitted by `profile save`". "Saving and restoring a tree's view" becomes "Restoring a tree's view from a profile" and describes the `files` entry's keys. "excluded from saved profiles" becomes "not restored from a profile".
- `product/specs/harness.md`: drop the `profile save always records the field` clause.
- `product/specs/root-path.md`: "a saved profile never contains it" becomes "a profile path cannot use it".
- `product/specs/sidebars.md`: the three `profile save` mentions become "bare `layout` reports it" and "a profile's `layout` key can set it".
- `product/specs/ssh-tab.md`: a profile's `ssh` entry (destination plus `options`) reconnects with those flags, rather than `profile save` capturing them.
- `product/specs/tabs.md`: "Profile saves retain group names" becomes a profile entry's `groupName`.
- `product/specs/pdf-tab.md`, `image-tab.md`, `markdown-tab.md`, `embedded-web-page.md`: "A profile can still capture one" becomes "a profile can still open one".
- `product/specs/tab-plugins.md`: "A profile captures a docked plugin tab" becomes "A profile entry can dock a plugin tab". "a saved shell reopens" becomes "a profile's shell entry reopens".
- `product/specs/remote-server.md`: delete "Remote shells are omitted when saving profiles, so a profile never starts a replacement local shell for them."

## Verification

**Fast check** after each step: `$janissary/scripts/run.mjs check-diff`.

**Full checks** once removal is done, each as green as the baseline (typecheck clean; lint 0 errors, 14 warnings; tests 1007 files, 14424 passed, 1 skipped): `npm run typecheck`, `npm run lint`, `npm test`. Documentation pages are edited, so `npm run docs:build` must also pass. `npm run check` is not run.

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

**Live check** of the one detached feature, the `profile` command's remaining subcommands, in a scratch instance driven through the attached browser. The scratch project gets a hand-written `profiles/notes.json` with one `editor` entry.

- `profile save demo` answers `Usage: profile launch <name> | profile list | profile validate [<name>]` and writes no `profiles/demo.json`.
- `profile list` lists `notes` alongside the built-in profiles.
- `profile validate notes` answers `Profile "notes" is valid.`
- `profile launch notes` opens the editor tab.

### Results

- Fast check green after every step.
- Full checks as green as the baseline: typecheck clean; lint 0 errors, 14 warnings; tests 1005 files, 14367 passed, 1 skipped. The two fewer files and 57 fewer tests are the deleted save tests. `npm run docs:build` passed.
- Dead-code scan after removal: identical to the baseline above, so no new finding to remove. A by-name search of every symbol the deleted code imported found each still used elsewhere, or used inside its own module.
- Live check: passed, in a scratch instance built from the working tree, with both browser variables present.
  - The scratch instance's activity log shows each reply as planned:
    - `profile save demo` answered `Usage: profile launch <name> | profile list | profile validate [<name>]`, and no `profiles/demo.json` was written.
    - `profile list` listed `notes` before the built-in profiles.
    - `profile validate notes` answered `Profile "notes" is valid.`
    - `profile launch notes` answered `Opened editor tab.`
  - The browser showed a `notes.md` editor tab with the file's text.
  - The driver's reader of the visible tab body did not pick up the three text replies, because the launch shell does not render them in that element's text. The app's own log is the evidence for those three.

## Out of scope

- Any launch-side profile field or loader behavior, including the `files` entry's tree-view keys, `groupName`, `browser`, `layout`, and `monitors` (decision 1).
- Removing `expandedPaths`, `detailOf`, their helpers, `MonitorManager.snapshot()`, or `HarnessView.sshOptions` (decisions 2 and 3).
- Migrating or cleaning up profiles already saved on users' machines, or a "this was removed" message for `profile save`.
- Test titles and comments in remaining features' tests that still mention `profile save`. This task may only delete assertions about the removed feature, so these stay as written:
  - `answers a launch or save with no name…` in `src/profile/manager.test.ts`
  - `src/harness/manager-browser.test.ts`, `src/harness/manager.test.ts`, `src/paths.test.ts`, `src/profile/file.test.ts`
  - the `profile capture and restore` describe in `src/file-navigator/manager.test.ts`
  - the `snapshot` tests in `src/monitor/manager.test.ts`
  - `web/src/file-navigator/useFileNavigatorSelection.test.ts`
- Completed plans in `product/plans/complete/` and `CHANGELOG.md`, which are historical records.
