# Remove the `--relaunch` flag

**Complexity: 5/10** — one CLI flag with three effects spread across the launcher, the startup path, the state-directory registry, and about 40 specs and 22 documentation pages. The code change is small and mechanical. The documentation and spec edits are wide, and the one behavior change (remote sessions reattach on every launch) needs a live check.

## Goal

Remove the `janus --relaunch` flag. After this change `janus --relaunch` is an unknown option and exits with a usage error (exit 2), as any other unknown option does. Every launch becomes a fresh start: the previous session's logs, recordings, transcripts, browser logs, git-failure output, and workspace clones are cleared, and `.janissary/log/server.log` is truncated. Parked remote sessions reattach on every launch, the way `--relaunch` used to make them reattach.

## Scope decisions (settled with the user)

- **Boundary:** the whole flag is removed. Its three effects are handled as follows.
  - The keep-state effect (`clearStateDirectories` skipping the per-run directories) is removed. Every launch clears them, which a normal launch already does today.
  - The log-append effect (`bin/janus.mjs` opening `server.log` in append mode) is removed. The log is always truncated.
  - The reattach effect (`controller.reattachSessions()` attaching every parked remote session at startup) is kept and becomes the behavior of every launch. The user chose this explicitly.
- **Removed name:** `--relaunch` gets whatever the app already does for an unknown option. No migration, alias, deprecation shim, or "this was removed" message.
- **Other meanings of "relaunch" stay.** Profile relaunch, same-name tab relaunch (`src/profile/*`, `src/plugins/launch-tab*.ts`, `src/launch-name/*`, `src/harness/manager.ts`), restarting the app, and restarting a tab (for example `-b` after a dead E2E browser) are not the flag and are not touched.
- **Shared piece:** the `always` marker on state-directory entries and the `relaunch` parameter of `clearStateDirectories` exist only to skip clearing on `--relaunch`. Both are removed. The `remoteFileCache` entry (the only `always: true`) is cleared on every launch like the other caches.
- **Sessions:** the parked-session record (`src/sessions/store.ts`) and the Sessions tab's Attach control are unchanged. Only the automatic reattach at startup changes, as described above. `SessionsManager.restoreAll()` keeps its one caller, so it is not dead after the change.
- **Backlog:** `product/backlog/features.md` line 17 ("Durable flows across relaunch") is kept unchanged. The user decided it describes restarting harness sessions across an app restart, not the flag.
- **Draft plan:** `product/plans/draft/add-system-schedules.md` is left alone. It still says the system tab is created at every startup "`--relaunch` included" and its tests cover "every launch, `--relaunch` included". The PR body names it as a plan that needs revision before implementation.
- **Deferred plan:** `product/plans/deferred/tab-plugin-architecture.md` line 151 is left alone. It still says "across `--relaunch` or profiles". The PR body names it.
- **Records untouched:** every file under `product/plans/complete/` and `CHANGELOG.md` keeps its historical `--relaunch` mentions.
- **Deep ties:** none found. No remaining feature is built around the flag. Its consumers (transcripts, recordings, browser logs, git-failure output, workspace clones, the Sessions tab) keep working and lose only the keep-state option.
- **Extension contracts:** none affected. `src/plugins/api.ts` and `ai/guidelines/plugins.md` do not mention the flag.
- **Data already on users' machines:** tolerated, never migrated. `server.log` and the per-run directories have no loader that depends on the flag. The parked-session record keeps its format, so existing records load unchanged and reattach on the next launch.

## Approach

The flag is parsed in `src/cli-args.ts` and passed through `src/main.ts` into two places: `clearStateDirectories(args.relaunch)` and `startServer({ relaunch })`. `src/index.ts` calls `controller.reattachSessions()` only when `options.relaunch` is set. The launcher `bin/janus.mjs` reads the same flag to choose append or truncate for `server.log`, and it lists the flag in its boolean-flag set. Each of these sites loses the flag, and the reattach call moves to run unconditionally.

The shared state-directory registry in `src/state/dirs.ts` loses the `always` field from every entry and the parameter from `clearStateDirectories`. Every entry with a `clear` runs on every launch.

## Implementation steps

Each step ends with the fast check (`./scripts/run.mjs check-diff`).

1. **CLI parsing and help.** `src/cli-args.ts`: remove the `relaunch` field, its default, its option declaration, and its value in the returned args. `src/cli-info.ts`: remove the `--relaunch` line from the usage text.
2. **Launcher.** `bin/janus.mjs`: remove `'--relaunch'` from `booleanFlags`, open `server.log` with `'w'` only, and update the comment that describes the append. `bin/read-log-since.mjs`: update the comment that describes the append. Delete `scripts/janus-launcher-relaunch.test.mjs`. Its launcher suite tests only the flag's append behavior. Its `readLogSince` suite tests `bin/read-log-since.mjs`, which the launcher still uses, so that suite moves unchanged to `scripts/read-log-since.test.mjs`. (Decided during the removal: the plan first said to delete the whole file, which would have dropped live coverage of a helper that stays.)
3. **State directories.** `src/state/dirs.ts`: remove the `always` field from `StateDirectoryEntry` and from every entry, remove the `relaunch` parameter of `clearStateDirectories` and its skip branch, and reword the comments that describe the skip. The `remoteSessions` and `notificationRecord` comments about "a fresh start must not sweep it" stay, minus any reference to the flag.
4. **Startup.** `src/main.ts`: call `clearStateDirectories()` with no argument, and drop `relaunch` from `startServer`. `src/index.ts`: remove `relaunch` from `ServerOptions`, and call `controller.reattachSessions()` unconditionally after the launch shell opens. `src/controller.ts`: reword the comment on `reattachSessions` so it describes what every launch does.
5. **Comments that describe the flag.** `src/shell/transcript/transcript-file.ts`, `src/harness/transcript-file.ts`, `src/tab/index.ts`, `src/sessions/manager.ts` (the `restoreAll` comment), and `web/src/plugins/pdf/PdfTab.tsx`. Each comment loses the flag and keeps its rule, restated as what every launch does.
6. **Specs.** Delete `product/specs/relaunch.md`. Update each spec that describes the flag: `cli.md` (the flags table row, the startup sequence step 5 and step 6, the launcher paragraph about the log), `application-state.md` (the opening paragraph), `state-directory.md` (the opening paragraph), `sessions-tab.md` and `remote-server.md` (every "after `--relaunch`" or "under `--relaunch`" sentence, reworded to "on launch"), and the remaining specs that list the flag among their behaviors: `open.md`, `scheduling.md`, `notifications.md`, `browser.md`, `diff-tab.md`, `profiles.md`, `editor-tab.md`, `video-tab.md`, `pdf-tab.md`, `image-tab.md`, `ssh-tab.md`, `tabs.md`, `harness-recording.md`, `embedded-web-page.md`, `shell-tab.md`, `search-tab.md`, `harness.md`, `audio-tab.md`, `file-navigator-tab.md`, `markdown-tab.md`, `tab-plugins.md`, `agent-questions.md`, and `database.md`. Each spec loses the flag's sentences. A sentence about the profile relaunch or tab relaunch stays. Every `relaunch.md` link is removed with its sentence.
7. **Documentation.** Update the 22 user-documentation pages that mention the flag: `getting-started/startup.md`, `getting-started/activity-log.md`, `getting-started/tabs.md`, `advanced-agents/remote-agents.md`, `advanced-agents/harness.md`, `advanced-agents/agent-questions.md`, `tab-types/notifications.md`, `tab-types/audio-player.md`, `tab-types/pdf-viewer.md`, `tab-types/editor.md`, `tab-types/video-player.md`, `tab-types/image-viewer.md`, `tab-types/web-pages.md`, `tab-types/file-navigator.md`, `tab-types/markdown-preview.md`, `automation/scheduling.md`, `automation/monitoring.md`, `command-bar/browser.md`, `command-bar/project-search.md`, `command-bar/plugins.md`, `command-bar/shell.md`, and `command-bar/database.md`. In `startup.md`, remove the flag's row from the flags table, rewrite the "Keeping state with `--relaunch`" section so it describes what every launch does (the per-run files are cleared, and parked remote sessions reattach), and remove the sentences that say a launch without the flag leaves them detached. The `server.log` paragraph loses its "kept across `--relaunch`" clause. Other pages lose the flag's parenthetical or sentence. No documentation page is deleted, so the sidebar in `documentation/.vitepress/config.mts` is unchanged.
8. **Dead code.** Run the dead-code scan again and remove any finding the removal created, as the task's Step 8 says. Check by name first. Expected new findings: none, because `restoreAll` keeps its caller. Confirm by scan.
9. **Tests of the flag.** `src/cli-args.test.ts`: delete the default assertion for `relaunch`, the `parses --relaunch` test, the `--relaunch` assertion in the combined-flags test, and the help-text assertion for `--relaunch`. Add a test that `--relaunch` is rejected as an unknown option, if the existing strict-args tests have no such case. `src/state/dirs.test.ts`: delete the test that runs no per-subsystem clear on a relaunch, and update any test that calls `clearStateDirectories(true)` or `(false)`.

## Tests

- `src/cli-args.test.ts` loses only the assertions about the flag.
- `src/state/dirs.test.ts` loses only the relaunch-skip assertion.
- `scripts/janus-launcher-relaunch.test.mjs` is deleted. Its flag-only launcher suite is dropped, and its `readLogSince` suite moves unchanged to `scripts/read-log-since.test.mjs`.
- No other test file changes. The `restoreAll` tests in `src/sessions/manager.test.ts` and the `launch-tab`, `profile`, and `controller` tests that use "relaunch" for other meanings stay.

## Spec updates

Listed in step 6. The spec for the flag, `product/specs/relaunch.md`, is deleted. Its content (state kept, log appended, sessions reattached) is no longer true, so nothing replaces it. The sessions reattach is described in `sessions-tab.md` and `remote-server.md`, and the startup sequence is described in `cli.md`.

## Verification

- **Fast check after each step:** `./scripts/run.mjs check-diff`.
- **Full checks, once all steps are done:** `npm run typecheck`, `npm run lint`, `npm test`, and `npm run docs:build`. Each must be as green as the baseline. The baseline had 0 lint errors and 10 pre-existing warnings, all `sonarjs` complexity or duplicate-string warnings in files this change does not touch. The baseline test run had 921 files and 13189 tests passing, 1 skipped. The docs build passed.
- **Dead-code baseline (`npm run knip`), complete findings before the removal.** It exits 1. These findings were already there and are left alone for `ai/tasks/hygiene/remove-deadcode.md`:
  - Unused files (1): `src/plugins/file-capabilities.ts`.
  - Unused exports (6): `AGENT_MONITOR_SCHEMA_VERSION` (`src/plugins/agent-monitor/shared.ts:1:14`), `inheritGroupName` (`src/tab/groups.ts:65:17`), `RemoteChip` (`web/src/plugins/api.ts:73:10`), `diffIcon` (`web/src/plugins/api.ts:95:145`), `dragging` (`web/src/plugins/roles/roles-dnd.ts:44:17`), `diffIcon` (`web/src/shared/icons.ts:39:19`).
  - Unused exported types (3): `EffortLevel` (`src/harness/effort-levels.ts:8:13`), `TabPluginLaunchReady` (`src/plugins/api.ts:33:27`), `AgentRunUpdatedEvent` (`src/protocol.ts:117:3`).
- **Live checks** (scratch instance, built from the working tree; both `JANISSARY_BROWSER_WS_ENDPOINT` and `JANISSARY_PLAYWRIGHT` were set):
  - Normal launch: the scratch instance started and answered 200 on its page. The launch shell `janus` was open and active, and the tab strip was ready. No notifications and no console errors.
  - Log truncation: `.janissary/log/server.log` held exactly one `__JANUS_URL__` line after the launch.
  - Sessions tab: opened from the command line and showed "No remote sessions", so the tab still works without the flag.
  - Remote session reattach on every launch: **skipped — not possible here.** Reattach needs a parked remote session and a reachable peer host. The scratch instance had neither, so the reattach path ran against an empty store. `restoreAll()` is covered by its existing unit tests in `src/sessions/manager.test.ts`.
- **Flag rejection:** `janus --relaunch <dir>` exits 2 with "Unknown option '--relaunch'". Run against a separate directory, so the live instance's log was not touched.

## Out of scope

- Any handling for a user whose `server.log`, per-run directories, or parked-session record was written by an older `--relaunch` run. These are tolerated and never migrated.
- Any alias, deprecation window, or message for `--relaunch`.
- `product/plans/complete/**` and `CHANGELOG.md`, which record what happened.
- `product/plans/draft/add-system-schedules.md` and `product/plans/deferred/tab-plugin-architecture.md`, which still mention the flag and are named in the PR body.
- `product/backlog/features.md` line 17, kept unchanged by decision.
- Profile relaunch, same-name tab relaunch, app restart, and tab restart. These keep their meanings.
- The dead-code findings in the baseline above.
