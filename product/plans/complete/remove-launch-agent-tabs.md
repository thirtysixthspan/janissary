# Remove launch agent tabs

**Complexity: 8/10** — the launch tab changes kind (an agent tab becomes a zsh shell tab opened through the shell plugin with no origin tab), `--relaunch` loses agent restore together with the agent-state files, the transcript store, and the `state` command that read them, about a hundred server tests lose the implicit `janus` agent tab they stage in, and the docs-screenshot reset and most of its shots are reworked around a shell starting tab and regenerated.

## Goal

No launch opens an agent tab. A fresh `janus` launch opens one zsh shell tab labelled `janus` in place of today's `janus` agent tab, and `janus --relaunch` no longer rebuilds agent tabs from saved state: it opens the same launch shell, keeps the previous session's logs, recordings, and workspace clones, and reattaches parked remote sessions. Agent-state files, the per-tab transcript store, and the `state` command go with the restore they existed for. Every remaining feature that touched the launch tab or the saved state — typed commands, profile launch and save, remote session attach, the docs-screenshot tooling — keeps working without it.

## Approach

- **Launch shell.** The `TabManager` starts with no tabs. After the controller is built, `startServer` awaits a new core step that runs the shell plugin's `zsh` command with a *launch origin*: a reserved origin labelled `janus` that is not an open tab. The plugin context treats that origin as the project root (`originTab()` answers `cwd` and `root` = launch dir, not remote, no workspace) and lets `openOrFocusTab` proceed without an existing origin tab; the host opens the plugin tab under the fixed label `janus` instead of an agent-pool name. With no other tabs, the existing creator-less defaults give it the first palette colour `#5b9cff` and group 1. Only then does `--relaunch` reattach remote sessions, and only then does the server listen. If no tab results (no `/bin/zsh`, the plugin failed to activate or is disabled), startup throws `could not open the launch shell: <reason>`, which `janus` reports through its existing failed-to-start banner.
- **Relaunch.** `controller.rehydrate()` keeps only `sessions.restoreAll()`. `rehydrateTabState`, `rehydrateTabs`, `applyRehydratedState`, `rehydrateTabViews`, and `TabManager.rehydrate` go.
- **Saved state.** Agent-state files (`.janissary/state/<label>.json`) and the transcript store (`.janissary/transcripts/<label>.json`) stop being written: `TabManager.persist`, `AgentStatePersistence`, `persistAgentState`, `forgetPersisted`, every `persist(buildAgentState(…))` call site, the close-time file deletes, `TranscriptStore`, and both `state-dirs.ts` entries go. Files already on disk are left alone.
- **`state` command.** Removed with its formatter.
- **Detaching.** Profile save keeps silently skipping the launch tab (now a shell). Profile launch's label-less plugin entries match the tab the entry opened rather than any tab of that plugin. The docs-screenshot reset recreates a shell starting tab aliased `janus`, and the shots that staged in the old agent root tab are reworked for a shell and regenerated.

## Scope decisions

1. **Relaunch boundary** — no launch opens an agent tab: `--relaunch` stops restoring agent tabs, and their schedules, queues, transcripts, aliases, groups, and working directories go with it.
2. **Launch tab label** — the launch shell is labelled `janus` (fixed, not an agent-pool name), dot `#5b9cff`, group 1.
3. **Cmd+T in the launch shell** — unchanged shell behaviour: it opens another shell; `agent` (typed in the shell's command bar) opens an agent.
4. **Exiting the launch shell** — `exit` or `Ctrl+D` in the last remaining shell closes its tab and quits the app directly, as any last tab whose process exits does today.
5. **Saved state** — agent-state files and the transcript store are removed entirely; the `state` command's file read goes with them (and see 11).
6. **What `--relaunch` keeps** — the flag stays: it still keeps logs, harness capture/recording/transcript files, browser logs, git-failure output, and local workspace clones instead of clearing them, appends to `server.log`, and reattaches parked remote sessions. `janus --help` text ("Attach to existing state instead of clearing it") is unchanged.
7. **Test setup** — the user allows a setup-only edit: one shared test helper seeds a `janus` agent tab (what `makeRootTab` built) into a fresh `TabManager`, and each test that staged in the implicit root tab calls it in its setup. No assertion about remaining behaviour changes.
8. **Profile save** — still silently omits the launch tab (`tabs[0]` labelled `janus`), now a shell, so launching the saved profile does not open a second shell beside the launch one.
9. **Profile launch of a label-less plugin entry** (e.g. the built-in `debugging` profile's `zsh` entry) — matches the tab that was not open before the entry ran, so the launch shell is never grabbed and moved into the profile's group.
10. **Docs-screenshot reset** — the reset recreates a shell starting tab and the shots are regenerated (see 13–19).
11. **`state` command** — removed entirely. A typed `state` gets the unknown-command behaviour (in a shell tab it goes to zsh).
12. **Launch shell cannot open** — startup fails with the failed-to-start banner, e.g. `janissary <version> — failed to start: could not open the launch shell: <reason>`. No zero-tab state.
13. **Screenshot starting-tab name** — after typing `zsh` the reset runs `rename janus` in the new shell, so the strip shows `janus` on every run; routing by name still uses its pool label.
14. **Shots that staged in the agent root tab** — reworked to run in the starting shell (commands go to zsh or the app through the shell's command bar), not given an agent tab first.
15. **Replacement for `state` in examples** — `help`: `msg bilal request help` (messaging-output), `help` in the history-picker setup, and `schedule standup in bilal every day at 9:00 help` in `scheduling.md`'s agent-tab example.
16. **db-output** — a `data-doc-shot="shell-view"` crop target is added to the shell tab body; the `db` commands run in the starting shell and the shot crops its terminal. `database.md` caption: "A db sqlite create command followed by a db sqlite query command in a shell tab, with the query's result table rendered below it."
17. **history-picker** — shoots the shell tab's own `Ctrl+R` list after `ls -la`, `git status`, `help`; `history.md` gains one sentence saying a shell tab's `Ctrl+R` lists that shell's own history.

    The alias in 13 changes only what the strip shows, so a surface that names a tab by its label — the schedules tab's owning-tab column — shows the starting shell's pool name, which differs between runs.
18. **tabs-overview** — three shell tabs: the starting shell (`janus`) opens `zsh` (aliased `bilal`), which opens `zsh` (aliased `cavus`); from `cavus`, `send bilal sleep 1` (badge on the hidden `bilal`) and `send janus sleep 30` (blinking `janus`). `tabs.md` caption: "The tab strip with three shell tabs: each has a colored dot, one dot is blinking while its shell runs a command, and an inactive tab carries a flag badge for unread output."
19. **app-overview wording** — `application.md` alt text: "The Janissary window on first launch: a single janus shell tab with its zsh terminal above the command bar." Its "A session begins as a single tab" sentence names the zsh shell tab.
20. **`--relaunch` docs wording** — `startup.md` flag row: "Keep the previous session's logs, recordings, and workspace clones instead of clearing them, and reattach parked remote sessions." The "Resuming a session with `--relaunch`" section is rewritten to match and renamed "Keeping state with `--relaunch`".
21. **Schedule shots** — schedule-window and schedules-tab, staged in the shell, schedule zsh commands: `schedule standup every day at 9:00 git pull` and `schedule tests every 2h ls`.
22. **Backlog** — no open backlog entry concerns the launch tab, relaunch agent restore, or `state`. The `## resolved` log lines in `product/backlog/documentation.md` that mention relaunch and the state directory are historical records and are left alone.

Found during the removal and settled with the user:

23. **Shell-tab lines in the global history** — a line typed into a shell tab's command bar never reached the global history ghost text completes from, so a shell-staged ghost-text shot showed no suggestion. Every line a shell tab's own command bar records in its history — whichever route it took, app command or zsh, `!` lines included — now also enters the global history, attributed to that tab, as a line submitted in an agent tab's bar does. Lines typed directly into the terminal, and lines another tab delivers with `send` or `queue`, are not recorded. This adds an additive server capability, `recordGlobalHistory(line)`, scoped to the plugin's own answering tab, and a shell `remember` intent the bar sends; the API integer is unchanged. ghost-text stays staged in the shell (`git status`, then `git` typed).
24. **`isValidAgentName`** — the filename-safety guard that lived in the deleted agent-state module moves into `src/agent/names.ts`, its only remaining user, so the `.janissary/agent-names.json` override is validated exactly as before; its test case moves to `src/agent/names.test.ts`.
25. **messaging-output request** — `msg bilal request shell ls src` rather than `help` (whose whole-page reply filled the crop) or `shell pwd` (which printed the scratch run's absolute path). bilal is opened `--no-workspace`, since a workspaced agent's shell cannot start inside the sandboxed workspace the shots were regenerated in.
26. **harness-tab shot** — removed: neither a `claude` nor an `opencode` harness could start in the scratch instance here, so the manifest entry, `documentation/public/screenshots/harness-tab.png`, and its image line in `advanced-agents/harness.md` go.
27. **Reset staging tab** — the reset types its throwaway agent as `agent resetting --no-workspace`, because the shell opened from it inherits its workspace, and a workspaced shell exits at once inside the sandbox.
28. **state-dirs registry count** — `src/state-dirs.test.ts` pins the registry's length; it changes from 15 to 13 with the two removed entries.

Already decided by the task, not asked: a removed name (`state`) behaves as if it never existed; data on users' machines (old `.janissary/state/` and `.janissary/transcripts/` files) is tolerated, never migrated or cleaned up — nothing reads them any more, so a launch with them present is unaffected; no published extension contract is removed (the launch origin is an internal host addition); completed plans and the changelog are untouched.

## Implementation steps

1. **Fixed-label, origin-free plugin open** — `src/tab/creators.ts` `addPluginTab` and `src/tab/openers.ts` `openPluginTab` take an optional fixed label that wins over the agent-pool and prefix labels. `src/plugins/failure.ts` (`PluginFailureOrigin`) gains a launch marker; `src/plugins/line-capabilities.ts` `originTab()` answers a launch origin with the launch dir as `cwd` and `root`, not remote, no workspace; `src/plugins/context.ts` `openOrFocusTab` skips its origin-exists check for a launch origin and passes the fixed label. `note` and other origin-addressed capabilities keep doing nothing for a label that is not an open tab.
2. **Launch shell** — new `src/launch-shell.ts`: `openLaunchShell(managers)` runs `managers.plugins.runCommand('shell', 'zsh', <launch origin "janus">)`, then throws `could not open the launch shell: <reason>` when the tab list is still empty. `src/index.ts`: after `createController`, await it (shutting the controller down and rethrowing on failure), then `if (options.relaunch) controller.rehydrate()`, then listen. Check `src/main.ts`'s failed-to-start path reports the error.
3. **No root agent tab** — `src/tab/manager.ts` constructor starts with `tabs = []`; delete `src/tab/root.ts`.
4. **Relaunch agent restore** — delete `src/tab/rehydrate.ts`, `src/tab/rehydrate-state.ts`, `rehydrateTabViews` in `src/tab/view-operations.ts`, `TabManager.rehydrate`; `src/controller.ts` `rehydrate()` calls only `sessions.restoreAll()`.
5. **Saved state** — remove `TabManager.persist`/`persistQueue`/`forgetPersisted`, `src/tab/persistence.ts`, `src/tab/manager-persistence.ts`, every `persist(buildAgentState(…))` call (schedule, shell, communication, pseudoterminal, ACP, controller events, profile place-agent, commands/schedule, editor rename, tab transcript/navigation/rename/operations/retarget-editor), the deletes in `src/tab/cleanup.ts`, `src/transcript/store.ts`, and the `agentState` and `transcriptStore` entries and keys in `src/state-dirs.ts`. `src/agent/state.ts` keeps only what something else still uses (`isValidAgentName`). `buildAgentState` and `AgentState` fields go where the scan finds them unused.
6. **`state` command** — delete `src/commands/state.ts`, its registration in `src/commands/index.ts`, `src/state-format.ts`, and the `state` row of `help.md`.
7. **Profile save** — `src/profile/save/route.ts`: the launch tab (`tabs[0]` labelled `janus`) is skipped silently whatever its kind; comments say it is the launch shell.
8. **Profile launch matching** — `src/profile/view-tabs.ts`: after a target runs, take the matching tab that was not open before it ran (fall back to the existing match when the entry focused an already-open tab, as path-backed entries do).
9. **Shell tab crop target** — `web/src/plugins/shell/ShellTab.tsx`: `data-doc-shot="shell-view"` on the tab body; confirm the shell's `Ctrl+R` list renders with a crop target (`history-overlay`), adding one if not.
10. **Docs-screenshot reset and manifest** — `scripts/docs-screenshots/reset.mjs`: from the staging tab type `zsh`, then `rename janus` in the new shell, close the staging tab, and wait for the one remaining `janus`; comments rewritten. `scripts/docs-screenshots/manifest.mjs`: rework tabs-overview, db-output, history-picker, task-picker, ghost-text, schedule-window, schedules-tab, and messaging-output per decisions 14–18 and 21 (shell lines typed without the `shell` keyword so they reach zsh); other shots keep their setup. `scripts/docs-screenshots/reset.test.mjs` follows.
11. **Tests** — see Tests.
12. **Specs and docs** — see Spec updates.
13. **Screenshots** — build the web bundle and run `./scripts/run.mjs docs-screenshots`; commit every regenerated PNG.

## Tests

Deleted (only about the removed behaviour):

- `src/tab/rehydrate*.test.ts`, the relaunch/rehydrate cases in `src/controller.test.ts` and `src/tab/manager.test.ts` that assert restored agent tabs, schedules, queues, or transcripts.
- `src/agent/state.test.ts` cases for save/load/list/delete, `src/tab/persistence*.test.ts`, `src/transcript/store.test.ts`, persistence assertions elsewhere (a `persist` spy or a state file written or deleted).
- `src/commands/state.test.ts`, `src/state-format.test.ts`.
- Assertions that the constructor makes a `janus` agent tab.

Setup-only edit (decision 7): a shared helper (`src/test-support/` or the existing test-helper location) seeds the `janus` agent tab; each server test that staged in the implicit root tab calls it after building its `TabManager`, managers, or controller. `src/harness/manager-browser-test-fixture.ts` is already explicit and unchanged.

Added or changed for the new behaviour:

- `src/launch-shell.test.ts` — opens one shell tab labelled `janus`, dot `#5b9cff`, group 1, cwd the launch dir; throws `could not open the launch shell: …` when the plugin opens nothing.
- `src/tab/creators.test.ts` / `src/tab/openers.test.ts` — a fixed label wins over the agent pool.
- `src/plugins/*` — a launch origin answers `originTab()` with the root and lets `openOrFocusTab` open with no origin tab.
- `src/index.test.ts` / `src/controller.test.ts` — `--relaunch` restores no agent tab and still runs `sessions.restoreAll()`; startup rejects when the launch shell cannot open.
- `src/profile/view-tabs.test.ts` — with a shell already open, a `zsh` entry relocates the newly opened shell, not the existing one.
- `src/profile/save/index.test.ts` — the launch shell is neither written nor listed.
- `scripts/docs-screenshots/reset.test.mjs` — the reset types `zsh` from the staging tab, then `rename janus`, and leaves exactly one tab shown as `janus`.

## Spec updates

- `product/specs/tabs.md` — Default tab: a single `janus` zsh shell tab (see [[shell-tab]]) with dot `#5b9cff`; drop the `--relaunch` restore sentences (Default tab, Agent tab creation, Persistence bullet, alias persistence, `hasUnread` persistence wording); root group is the launch shell.
- `product/specs/application-state.md`, `product/specs/relaunch.md`, `product/specs/state-directory.md`, `product/specs/cli.md` (startup step 5) — relaunch keeps state and reattaches remote sessions; no agent restore, no state or transcript store files.
- `product/specs/shell.md` — drop "saved to the agent state file" and the Restoration on relaunch section.
- `product/specs/shell-tab.md` — the launch shell; drop the `state` paragraph.
- `product/specs/application-commands.md` — drop the `state` section.
- `product/specs/profiles.md` — save skips the launch shell; label-less plugin entries match the tab they opened.
- `product/specs/docs-screenshots.md` — the reset recreates a shell starting tab aliased `janus`.
- Every other spec sentence that says an agent tab's state, schedule, queue, alias, or transcript is saved or restored on `--relaunch` (found by a `relaunch` / `agent state` sweep) is removed or reworded; sentences saying a view tab is "never restored on `--relaunch`" stay true and are left.
- Docs: `getting-started/startup.md` (decision 20), `getting-started/tabs.md` (launch tab, caption 18), `getting-started/groups.md` (root group), `getting-started/application.md` (decision 19), `command-bar/commands.md` (`state` row and section), `command-bar/history.md` (decision 17), `command-bar/database.md` (caption 16), `automation/scheduling.md` (example 15), `automation/profiles.md` (save skip), and every other page sentence that promises agent restore on `--relaunch`. `help.md` loses the `state` row.

## Verification

Checks (Step 2 discovery, Janissary checkout):

- Fast check after each step: `./scripts/run.mjs check-diff`.
- Full: `npm run typecheck`, `npm run lint`, `npm test`, `npm run docs:build` (docs pages are edited), each as green as the baseline. Baseline: typecheck clean; lint 0 errors, 1 warning; tests 828 files passed, 12111 tests passed, 1 skipped.
- Dead-code: `npm run knip`, compared against this baseline:

```
Unlisted binaries (6)
gitleaks      package.json
opengrep      package.json
mkfifo        src/notifications/record.test.ts
sandbox-exec  src/sandbox/keychain.sandbox.test.ts
sandbox-exec  src/sandbox/opencode-models.sandbox.test.ts
getconf       src/sandbox/resolve.ts
Unresolved imports (4)
.../workspace/manager.js  src/git/sync.test.ts:2:39
./config.js               src/notifications/index.test.ts:2:41
./managers.js             src/notifications/index.test.ts:3:31
../protocol.js            src/plugins/shell/shared.test.ts:2:59
Unused exports (5)
SEARCH_INSTANCE_KEY            src/plugins/search/session.ts:163:26
size                 function  web/src/overlay-plugins/clipboard-history/store.ts:67:17
isEdited             function  web/src/plugins/image/edit-model.ts:55:17
isNullCell           function  web/src/plugins/sql/grid-view.ts:171:17
currentObject        function  web/src/plugins/sql/grid-view.ts:193:17
Unused exported types (3)
ClearFiltersIntent  type  src/plugins/sql/shared-intents.ts:25:13
RefreshIntent       type  src/plugins/sql/shared-intents.ts:29:13
OverlayPluginItems  type  web/src/overlay-plugins/api.ts:65:13
Configuration hints (2)
web/src/env.d.ts    knip.json  Remove from ignore
open                knip.json  Remove from ignoreBinaries
```

Live checks, in one scratch instance driven by the e2e driver (a browser is attached to this tab):

- **Launch** — one tab, a shell labelled `janus`, dot `#5b9cff`, its terminal live; typing `agent` in its command bar opens an agent tab in group 1; `Cmd+T` in it opens another shell.
- **`--relaunch`** — after a session with an extra agent tab, a relaunch opens only the launch shell.
- **Profile launch** — the built-in `debugging` profile's `zsh` entry opens a new shell in the profile's group and leaves the launch shell in group 1.
- **Profile save** — `profile save` neither writes nor lists the launch shell.
- **Remote session reattach on `--relaunch`** — not reachable here (no remote host); recorded as skipped.
- **Docs-screenshot reset** — exercised by regenerating every shot (step 13).

Results (scratch instances on the working tree at `f18abb6d` plus the removal, driven through the attached browser):

- Launch — passed. One tab, `janus`, dot and group band `#5b9cff`, a live zsh in `$root/`. `agent` typed in its bar opened agent `fikri` in group 1; `Cmd+T` in it opened shell `imran`, not an agent.
- `--relaunch` — passed. After sessions that had agent tabs (`fikri`, `tester`), `janus --relaunch` opened only the `janus` shell.
- Profile save — passed. `profile save saved` reported `Saved profile "saved": 1 plugin tab, layout. Window size not captured (no window open). Skipped: fikri.`; the file held only the `imran` shell, and the launch shell was neither written nor listed.
- Profile launch — failed on the first run, then passed. A project profile with one group-2 `zsh` entry, launched from the launch shell, opened the new shell but placed the launch shell's identity instead, because the new tab was found by object identity and an open rebuilds the tab records. Fixed by comparing labels (`src/profile/view-tabs.ts`), with `src/profile/view-tabs-shell.test.ts` now rebuilding records as the real manager does. On the rerun the new shell `timur` took group 2 with its own band colour, and the launch shell stayed first in group 1 with the launch blue.
- Shell-bar lines in the global history — passed. `echo verify-ghost-line` sent from the launch shell's bar ghost-completed in an agent tab's bar from `echo verify-gh`. Also exercised by regenerating ghost-text.
- Remote session reattach on `--relaunch` — skipped: no remote host is reachable from this workspace.
- Docs-screenshot reset — exercised by regenerating every shot. harness-tab could not be captured (no harness starts inside this sandboxed workspace) and was removed per decision 26.
- Full checks after the removal: typecheck clean; lint 0 errors; tests 827 files passed, 12031 tests passed, 1 skipped; `npm run docs:build` passed. `npm run knip` reported exactly the baseline above — no new finding. `src/controller/shell.unsandboxed.test.ts`, which `npm test` does not run, was edited (its relaunch case deleted, its root-path cases seeded) but could not be run here, because the sandbox denies the signal its shutdown sends.

## Out of scope

- Any migration or cleanup of old `.janissary/state/` and `.janissary/transcripts/` files on users' machines.
- A way to name a shell tab from the `zsh` command.
- Changing `Cmd+T`, the shell tab's exit behaviour, or the quit rule for the last tab.
- Removing `--relaunch` or its remote-session reattach.
- `product/plans/complete/*`, `CHANGELOG.md`, and the `## resolved` log in `product/backlog/documentation.md`, which are historical records.
