# documentation

## ready

* sleep-and-resume (8/10) — Laptop sleep and resume has no page under `documentation/user-documentation/` and no `help.md` coverage; the only mentions are a marketing sentence in `documentation/user-documentation/getting-started/why-janissary.md` and the seven-day remote detach note inside `documentation/user-documentation/advanced-agents/remote-agents.md`. 13 of 14 facts are undocumented, including the automatic window reconnect with backoff (a quarter second to five seconds, with an immediate retry on focus), the `Reconnecting…` / `Cannot reach session` / `Reconnected` status banner, the liveness check that replaces a half-open connection, the rule that terminal output produced while disconnected is not replayed, the buffered-output cap on detached remote sessions, the overdue-command behavior (`<command> ran <duration> late (system was asleep)` — absent from both `documentation/user-documentation/automation/scheduling.md` and `documentation/user-documentation/tab-types/notifications.md`), and the limit that a killed server or reboot is not recovered. Fix by adding a new page (a getting-started or automation topic) and covering the late-delivery notification where scheduling and the notifications feed are described. Ground truth: `product/specs/sleep-and-resume.md`, `src/resume-watch.ts`, `web/src/reconnect-policy.ts`, `src/schedule/manager.ts`.

* sessions-tab (7/10) — The sessions tab has no page under `documentation/user-documentation/` and no `help.md` row for `sessions`; its only coverage is three paragraphs inside `documentation/user-documentation/advanced-agents/remote-agents.md` describing detach, attach, terminate, and the seven-day expiry. About 16 of 22 facts are undocumented, including the `sessions left` / `sessions right` docking words, the five row states (`provisioning`, `active`, `reconnecting`, `detached`, `terminated`), the Forget action and when it appears, opening a row by click or Enter and the Up/Down/Home/End navigation, the refresh-on-focus behavior, the per-action notification lines (`<what> on <host> detached.` and friends), the detach/attach control every remote tab's metadata row now carries, and the fact that a parked session appears in neither `connection list` nor the connections panel. Fix by adding a new page under `documentation/user-documentation/tab-types/` (the conversations list is the closest model) and a `help.md` row. Ground truth: `product/specs/sessions-tab.md`, `src/plugins/sessions/manifest.ts`, `src/sessions/manager.ts`.

* commit-to-origin (4/10) — Commit-to-origin is documented in `documentation/user-documentation/tab-types/editor.md` and `documentation/user-documentation/tab-types/file-navigator.md`, but 2 of 15 facts are missing. The editor tab's commit icon tooltip now names the branch the push will land on as `Commit to origin (branch <name>)` with the committing/committed/failed state appended (the navigator's equivalent tooltip is documented; the editor's is not), and the navigator commit no longer fails its rebase when the tree holds unrelated uncommitted work — dirty or untracked files it was never asked to commit are set aside before the rebase and restored afterward, whether the rebase lands or is abandoned. Fix by extending the existing commit paragraphs in both pages. Ground truth: `product/specs/editor-tab.md`, `product/specs/file-navigator-tab.md`, `src/git/commit.ts`, `web/src/shared/commit-branch-tooltip.ts`.

## development

## deferred

## declined

## resolved

* cli — documented in documentation/user-documentation/getting-started/startup.md (removed 2026-09-13)
* sandbox — documented in documentation/user-documentation/advanced-agents/workspacing.md, documentation/user-documentation/command-bar/tasks.md (removed 2026-09-13)
* remote-server — documented in documentation/user-documentation/advanced-agents/remote-agents.md (removed 2026-09-13)
* application-themes — documented in documentation/user-documentation/command-bar/commands.md (removed 2026-09-13)
* task-picker — documented in documentation/user-documentation/command-bar/tasks.md, help.md (removed 2026-09-13)
* editor-git-sync — documented in documentation/user-documentation/tab-types/editor-git-sync.md (removed 2026-09-13)
* context-menu — documented in documentation/user-documentation/getting-started/context-menus.md, documentation/user-documentation/advanced-agents/harness.md, documentation/user-documentation/tab-types/editor.md, documentation/user-documentation/tab-types/file-navigator.md (removed 2026-09-13)
* harness-recording — documented in documentation/user-documentation/advanced-agents/harness.md (removed 2026-09-08)
* file-creation-commands — documented in documentation/user-documentation/tab-types/opening-files.md, documentation/user-documentation/command-bar/commands.md, help.md (removed 2026-09-07)
* notifications — documented in documentation/user-documentation/tab-types/notifications.md, documentation/user-documentation/command-bar/commands.md (removed 2026-09-07)
* conversations — documented in documentation/user-documentation/tab-types/conversations.md, documentation/user-documentation/getting-started/tabs.md, documentation/user-documentation/command-bar/commands.md, help.md (removed 2026-09-07)
* profiles — documented in documentation/user-documentation/automation/profiles.md (removed 2026-08-30)
* history — documented in documentation/user-documentation/command-bar/history.md (removed 2026-08-30)
* editor-tab — documented in documentation/user-documentation/tab-types/editor.md, help.md (removed 2026-08-30)
* open — documented in documentation/user-documentation/tab-types/opening-files.md (removed 2026-08-27)
* workspaced-agent — documented in documentation/user-documentation/advanced-agents/workspaced-agent.md (removed 2026-08-27)
* video-tab — documented in documentation/user-documentation/tab-types/video-player.md (removed 2026-08-27)
* tabs — documented in documentation/user-documentation/getting-started/tabs.md (removed 2026-08-27)
* harness — documented in documentation/user-documentation/advanced-agents/harness.md (removed 2026-08-27)
* connection — documented in documentation/user-documentation/command-bar/connections.md (removed 2026-08-27)
* image-tab — documented in documentation/user-documentation/tab-types/image-viewer.md, help.md (removed 2026-08-27)
* transcript-search — documented in documentation/user-documentation/command-bar/transcript-search.md, getting-started/keyboard.md, help.md (removed 2026-08-27)
* profiles — documented in documentation/user-documentation/automation/profiles.md, tab-types/audio-player.md (removed 2026-08-27)
* application-config — documented in documentation/user-documentation/getting-started/startup.md, tab-types/video-player.md, tab-types/audio-player.md (removed 2026-08-27)
* editor-tab — documented in documentation/user-documentation/tab-types/editor.md, help.md (removed 2026-08-27)
* shell — documented in documentation/user-documentation/command-bar/shell.md (removed 2026-08-27)
* cli — documented in documentation/user-documentation/getting-started/startup.md (removed 2026-08-27)
* file-navigator-tab — documented in documentation/user-documentation/tab-types/file-navigator.md, help.md (removed 2026-08-27)
* quit-confirmation — documented in documentation/user-documentation/command-bar/commands.md, getting-started/tabs.md (removed 2026-08-27)
* send — documented in documentation/user-documentation/command-bar/send.md, command-bar/tab-completion.md, help.md (removed 2026-08-27)
* tab-plugins — documented in documentation/user-documentation/command-bar/plugins.md, command-bar/commands.md (removed 2026-08-27)
* audio-tab — documented in documentation/user-documentation/tab-types/audio-player.md, help.md (removed 2026-08-27)
* agent-tokens — documented in documentation/user-documentation/advanced-agents/tokens.md, workspaced-agent.md, remote-agents.md, workflows/creating-a-new-project.md (removed 2026-08-27)
* remote-agents — documented in documentation/user-documentation/advanced-agents/remote-agents.md, help.md (removed 2026-08-27)
* editor-tab — documented in documentation/user-documentation/tab-types/editor.md (removed 2026-08-02)
* workspaced-agent — documented in documentation/user-documentation/advanced-agents/workspaced-agent.md (removed 2026-08-02)
* file-navigator-detail-modes — documented in documentation/user-documentation/tab-types/file-navigator.md, help.md (removed 2026-08-02)
* websocket-rpc — the flagged protocol is internal wire types shared between the Node server and the web client (see `src/protocol.ts`); per the developer-documentation guideline such implementation detail belongs in `product/specs/`, not `documentation/user-documentation/`, and it is already fully covered by `product/specs/websocket-rpc.md` (removed 2026-08-02)
* file-navigator-copy-and-paste — documented in documentation/user-documentation/tab-types/file-navigator.md, help.md (removed 2026-08-02)
* image-tab — documented in documentation/user-documentation/tab-types/image-viewer.md (removed 2026-07-29)
* monitoring — documented in documentation/user-documentation/automation/monitoring.md (removed 2026-07-29)
* agent-command-queue — documented in documentation/user-documentation/command-bar/queue.md (removed 2026-07-29)
* keyboard-navigation — documented in documentation/user-documentation/getting-started/keyboard.md (removed 2026-07-29)
* markdown-rendering — documented in documentation/user-documentation/advanced-agents/markdown-rendering.md (removed 2026-07-29)
* ssh-tab — documented in documentation/user-documentation/advanced-agents/harness.md (removed 2026-07-29)
* transcript — documented in documentation/user-documentation/getting-started/tabs.md (removed 2026-07-29)
* tab-reorder-drag — documented in documentation/user-documentation/getting-started/tabs.md (removed 2026-07-29)
* sidebars — documented in documentation/user-documentation/getting-started/tabs.md (removed 2026-07-29)
* harness-recording — documented in documentation/user-documentation/advanced-agents/harness.md, documentation/user-documentation/automation/monitoring.md (removed 2026-07-29)
* root-path — documented in documentation/user-documentation/getting-started/tabs.md (removed 2026-07-29)
* command-routing — documented in documentation/user-documentation/command-bar/shell.md, documentation/user-documentation/command-bar/database.md, documentation/user-documentation/advanced-agents/acp-agent.md (removed 2026-07-29)
* file-navigator-tab — documented in documentation/user-documentation/tab-types/file-navigator.md (removed 2026-07-29)
* append-only-log — documented in documentation/user-documentation/getting-started/activity-log.md (removed 2026-07-24)
