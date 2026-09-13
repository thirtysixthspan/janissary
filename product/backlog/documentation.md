# documentation

## ready

* sandbox (3/10) — `documentation/user-documentation/advanced-agents/workspacing.md` covers workspace isolation well; 2 of 14 facts are missing and none are wrong. Missing: that the sandbox carves in read access to the Janissary install root, which is what lets a shipped task and `$janissary/scripts/run.mjs` run from inside a workspaced tab (added with the `$janissary` task work); and the two isolation notices verbatim — `workspace isolation off: sandboxWorkspaces disabled in config` and `workspace isolation off: sandbox-exec unavailable` — which the page paraphrases as "a one-line notice" even though those are the strings a reader searches for. Ground truth is `product/specs/sandbox.md` and `src/sandbox/install-reads.ts`. Fix by adding the two message strings to the existing isolation paragraph in `workspacing.md` and one sentence on the install-root carve-in, cross-linked from `command-bar/tasks.md`.

* cli (3/10) — `documentation/user-documentation/getting-started/startup.md` documents the project-directory argument, all five flags, and `janus stop`; 3 of 14 facts are missing and none are wrong. Missing: a commands table naming `janus init [<project-dir>]` and `janus remote-serve [<project-dir>]` alongside `janus stop` (both are documented elsewhere — `workflows/creating-a-new-project.md` and `advanced-agents/remote-agents.md` — but a reader looking up the CLI never sees them listed); that more than one positional argument, and a `<project-dir>` that does not exist or is not a directory, are rejected before anything starts; and that usage errors exit with code 2. Ground truth is `product/specs/cli.md` and `bin/janus.mjs`. Fix by adding a short commands table to `startup.md` that cross-links the two existing pages, and extending the existing usage-error sentence.

## development


## deferred

## declined

## resolved

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
