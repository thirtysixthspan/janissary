# documentation

## ready

## development




* shell-tab (7/10) — 43 of 47 facts are correct with two wrong and two missing. Wrong: `documentation/user-documentation/command-bar/shell.md` and `documentation/user-documentation/getting-started/tabs.md` say shell badges do not raise the 30-second "Agent is waiting" notification, but the shell plugin's `setUnread` arms escalation, and shell.md says starting another command does not clear a badge while a running state calls `setUnread(false)`. Missing: shell-owned pickers for docked/hidden shells and dragging file-navigator rows into the bar plus bracketed-paste/control-character stripping. Fix both wrong paragraphs and add the missing behaviors to `documentation/user-documentation/command-bar/shell.md`. Ground truth is `product/specs/shell-tab.md`, `src/plugins/shell/activate.ts`, `src/harness/idle-notification.ts` and `src/tab/transcript/events.ts`.

* sql-database (3/10) — 41 of 45 facts are correct with four missing and none wrong. The gaps are the exact "last eight pages" row-identity validity window described only as "long ago", behavior for a locked, corrupt or unreadable database file (object list, pages and exports fail while other SQL tabs continue), the console-prompt busy dot, and the deliberate absence of a statistics panel/join builder. Fix in `documentation/user-documentation/tab-types/sql-browser.md`. Ground truth is `product/specs/sql-database.md`, `src/plugins/sql/activate.ts`, `src/database/write.ts` and `web/src/plugins/sql/SqlTab.tsx`.

* state-directory (3/10) — nine of 11 facts are correct with two missing and none wrong. Missing: the remote-sessions record file is keyed per account (`remote-sessions.<account-hash>.json`), each instance writes only its own file while a load merges every account's file into one Sessions list, and a pre-keying `remote-sessions.json` is read the same way so a parked session survives the upgrade. Add a short note to `documentation/user-documentation/tab-types/sessions.md` and `help/sessions.md`. Ground truth is `product/specs/state-directory.md`, `documentation/user-documentation/getting-started/startup.md` and the files under `src/state/`.

* tab-completion (6/10) — 39 of 52 facts are correct with 13 missing and none wrong. The largest gap is the entire `file` command completion family (glob/grep/read subcommands, `file read` flags, `file glob` flags, `file grep`'s seven flags, paths against the command root, no paths on remote tabs). Web completion is only partly documented, and several per-command nuances are absent (runscript suggestions vanish with a bad catalog, name completion only for a non-empty bare word, case-sensitive matching, canonical-name settings sharing). Fix in `documentation/user-documentation/command-bar/tab-completion.md`. Ground truth is `product/specs/tab-completion.md`, `src/completion/index.ts`, `src/completion/web.ts` and `src/completion/file-grep.ts`.

* tab-plugins (5/10) — 10 of 11 facts are correct with one wrong. The example `plugins` output in `documentation/user-documentation/command-bar/plugins.md` omits the `commands` and `connections` bundled plugins that the app prints, and the "What a plugin gives you" view/command list omits those two. Add their status lines and views to that page only. Ground truth is `product/specs/tab-plugins.md`, `src/commands/plugins.ts`, `src/plugins/catalog.ts` and `src/plugins/failure.ts`.

* tabs (6/10) — 89 of 107 facts are correct with 17 missing and one wrong. Wrong: `documentation/user-documentation/getting-started/tabs.md` says shell tabs lack the file-navigator button, but shell tabs do render it. Missing nuances include detailed focus rules for `tab pane`/`tab split`, the full unread-badge dwell activation-path set and that a badge raised on a hidden tab survives a glance, the most-recently-focused replacement when a pane's selected tab closes or docks, provisioning failure and remote-attach indicator behavior, per-resource release-failure reporting, and drag commit/abort rules. Fix in `documentation/user-documentation/getting-started/tabs.md` and `documentation/user-documentation/getting-started/groups.md`. Ground truth is `product/specs/tabs.md`, `src/tab/view.ts` and `web/src/plugins/shell/ShellTabMeta.tsx`.

* transcript (5/10) — 14 of 21 facts are correct with six missing and one wrong. Wrong: the docs say ACP tool steps and thinking appear only in the connection tab, but auto-run ACP steps render as `+ <command>` prompt lines with response lines in the transcript. Missing: the prompt-bar scrollbar with faint `│`/`·` segments and percentage, mouse-wheel scrolling one line per tick, starting a command resetting a scrolled-up transcript to the bottom, the inline terminal card's key routing, the running command's "open in terminal" action and `(ran in terminal)` marker, and interleaved runs keeping separate output. Fix in `documentation/user-documentation/getting-started/keyboard.md` and `documentation/user-documentation/command-bar/shell.md`. Ground truth is `product/specs/transcript.md`, `src/tab/formatting.ts`, `web/src/shared/transcript/useTranscriptScroll.ts` and `web/src/shared/transcript/TerminalCard.tsx`.

* video-tab (3/10) — 23 of 26 facts are correct with three missing and none wrong, all about `video snapshot`: minutes and seconds after the first field must be below 60, a leading `~` expands to home and paths may contain spaces split at the first valid `at`, and a command typed in a tab whose session runs on another machine is refused. Fix in the snapshot paragraph of `documentation/user-documentation/tab-types/video-player.md`, with optional lines in `help/video.md`. Ground truth is `product/specs/video-tab.md`, `src/plugins/video/snapshot-parse.ts` and `src/plugins/video/snapshot.ts`.

* web-search (3/10) — 22 of 25 facts are correct with three missing and none wrong. The gaps are the agent-tool invocation rules: an agent triggers search by ending its reply with a single lowercase-only `web search …` line (bare line returns usage, capitalized sentence stays prose), a disabled or agent-off granted search refuses with `Command is disabled: web search.` (disabling the parent `web` cascades), and `agent` runs refuse every `web` line so the tool is ask/tell-only. Fix by adding an agent-tool paragraph to `help/web.md` and mirroring it in `documentation/user-documentation/advanced-agents/acp-agent.md`. Ground truth is `product/specs/web-search.md`, `src/web-search/command.ts`, `src/acp/tool-table.ts` and `src/commands/web.ts`.

* workspaced-agent (3/10) — 41 of 42 facts are correct with one missing and none wrong. The provisioning ready notification `Prepared workspace $workspace/<name> in <duration>.` (with ` on <host>` for remote, attributed to the owning tab, no time for failed, cancelled or abandoned clones) is absent from all docs. Add it to the Lifecycle/ready section of `documentation/user-documentation/advanced-agents/workspaced-agent.md` and list the workspace-ready event in `documentation/user-documentation/tab-types/notifications.md`. Ground truth is `product/specs/workspaced-agent.md`, `src/workspace/ready-notice.ts`, `src/controller/create-managers.ts` and `src/remote/manager-reports.ts`.

## deferred

## declined

## resolved

* sessions-tab — documented in documentation/user-documentation/tab-types/sessions.md (removed 2026-11-17)
* search-tab — documented in documentation/user-documentation/command-bar/project-search.md (removed 2026-11-17)
* root-path — documented in documentation/user-documentation/getting-started/tabs.md (removed 2026-11-17)
* roles — documented in documentation/user-documentation/tab-types/roles.md, help/roles.md (removed 2026-11-17)
* quit-confirmation — documented in documentation/user-documentation/command-bar/commands.md (removed 2026-11-17)
* pull-request-updating — documented in documentation/user-documentation/workflows/updating-a-pull-request.md (removed 2026-11-17)
* pull-request-testing — documented in documentation/user-documentation/workflows/testing-a-pull-request.md (removed 2026-11-17)
* pull-request-review — documented in documentation/user-documentation/workflows/pull-request-review.md (removed 2026-11-17)
* profiles — documented in documentation/user-documentation/automation/profiles.md, help/profile.md (removed 2026-11-17)
* notifications — documented in documentation/user-documentation/tab-types/notifications.md (removed 2026-11-17)
* models-tab — documented in documentation/user-documentation/tab-types/models.md, help/models.md (removed 2026-11-17)
* launcher — documented in documentation/user-documentation/tab-types/launcher.md (removed 2026-11-17)
* diff-tab — documented in documentation/user-documentation/tab-types/diff-tab.md, documentation/user-documentation/tab-types/diff.md, help/diff.md (removed 2026-11-17)
* conversations — documented in documentation/user-documentation/tab-types/conversations.md, help/conversations.md (removed 2026-11-17)
* connections-tab — documented in documentation/user-documentation/command-bar/connections.md, help/connections.md, help/connection.md (removed 2026-11-17)
* connection — documented in documentation/user-documentation/command-bar/connections.md (removed 2026-11-17)
* application-config — documented in documentation/user-documentation/getting-started/configuration.md (removed 2026-11-17)
* application-commands — documented in documentation/user-documentation/command-bar/commands.md, documentation/user-documentation/tab-types/commands.md, help/commands.md, help/help.md (removed 2026-11-17)
* agent-questions — documented in documentation/user-documentation/advanced-agents/agent-questions.md (removed 2026-11-17)
* agent-command — documented in documentation/user-documentation/advanced-agents/agent-command.md (removed 2026-11-17)
* acp-records — documented in documentation/user-documentation/command-bar/connections.md, documentation/user-documentation/advanced-agents/agent-command.md, help/connections.md (removed 2026-11-17)
* acp — documented in documentation/user-documentation/advanced-agents/acp-agent.md, help/ask.md (removed 2026-11-17)
* workspaced-agent — documented in documentation/user-documentation/advanced-agents/workspaced-agent.md, documentation/user-documentation/advanced-agents/remote-agents.md, documentation/user-documentation/advanced-agents/tokens.md (removed 2026-10-30)
* websocket-rpc — documented in documentation/user-documentation/tab-types/file-navigator.md, documentation/user-documentation/command-bar/quick-open.md, documentation/user-documentation/command-bar/tab-completion.md, help/files.md (removed 2026-10-30)
* video-tab — documented in documentation/user-documentation/tab-types/video-player.md (removed 2026-10-30)
* task-picker — documented in documentation/user-documentation/command-bar/tasks.md (removed 2026-10-30)
* tabs — documented in documentation/user-documentation/getting-started/tabs.md, documentation/user-documentation/getting-started/agents.md, documentation/user-documentation/command-bar/shell.md (removed 2026-10-30)
* tab-plugins — documented in documentation/user-documentation/command-bar/plugins.md, documentation/user-documentation/command-bar/shell.md, help/commands.md, help/plugins.md (removed 2026-10-30)
* tab-navigator — documented in documentation/user-documentation/command-bar/tab-navigator.md, help/nav.md (removed 2026-10-30)
* tab-completion — documented in documentation/user-documentation/command-bar/tab-completion.md, documentation/user-documentation/getting-started/tabs.md, help/keys.md, help/files.md (removed 2026-10-30)
* state-directory — documented in documentation/user-documentation/automation/scheduling.md, documentation/user-documentation/advanced-agents/tokens.md, help/schedule.md, help/scripts.md, help/commands.md (removed 2026-10-30)
* ssh-tab — documented in documentation/user-documentation/advanced-agents/harness.md (removed 2026-10-30)
* sql-database — documented in documentation/user-documentation/tab-types/sql-browser.md, help/sql.md (removed 2026-10-29)
* sleep-and-resume — documented in documentation/user-documentation/getting-started/sleep-and-resume.md, documentation/user-documentation/tab-types/file-navigator.md, documentation/user-documentation/advanced-agents/remote-agents.md (removed 2026-10-29)
* sidebars — documented in documentation/user-documentation/getting-started/tabs.md, documentation/user-documentation/tab-types/file-navigator.md (removed 2026-10-29)
* shell-tab — documented in documentation/user-documentation/command-bar/shell.md, documentation/user-documentation/getting-started/keyboard.md, documentation/user-documentation/tab-types/editor.md (removed 2026-10-29)
* shell — documented in documentation/user-documentation/command-bar/shell.md, documentation/user-documentation/command-bar/connections.md (removed 2026-10-29)
* sessions-tab — documented in documentation/user-documentation/tab-types/sessions.md (removed 2026-10-29)
* send — documented in documentation/user-documentation/command-bar/send.md, documentation/user-documentation/getting-started/tabs.md, help/keys.md (removed 2026-10-29)
* shell — documented in documentation/user-documentation/command-bar/shell.md (removed 2026-10-14)
* acp — documented in documentation/user-documentation/advanced-agents/acp-agent.md, documentation/user-documentation/advanced-agents/markdown-rendering.md (removed 2026-10-29)
* agent-command — documented in documentation/user-documentation/advanced-agents/agent-command.md (removed 2026-10-29)
* agent-questions — documented in documentation/user-documentation/advanced-agents/agent-questions.md (removed 2026-10-29)
* agents — documented in documentation/user-documentation/getting-started/agents.md, documentation/user-documentation/getting-started/tabs.md, documentation/user-documentation/tab-types/notifications.md, documentation/user-documentation/advanced-agents/harness.md (removed 2026-10-29)
* application-commands — documented in documentation/user-documentation/command-bar/commands.md, documentation/user-documentation/getting-started/tabs.md, documentation/user-documentation/tab-types/editor.md, documentation/user-documentation/tab-types/notifications.md, documentation/user-documentation/automation/scheduling.md, help/commands.md, help/execute.md, help/help.md, help/layout.md, help/quit.md, help/rename.md, help/tab.md (removed 2026-10-29)
* application-config — documented in documentation/user-documentation/getting-started/configuration.md, documentation/user-documentation/command-bar/clipboard.md (removed 2026-10-29)
* application-state — documented in documentation/user-documentation/command-bar/shell.md, documentation/user-documentation/automation/scheduling.md, documentation/user-documentation/advanced-agents/remote-agents.md, documentation/user-documentation/getting-started/startup.md (removed 2026-10-29)
* application-themes — documented in documentation/user-documentation/command-bar/commands.md, documentation/user-documentation/command-bar/shell.md, documentation/user-documentation/getting-started/configuration.md (removed 2026-10-29)
* audio-tab — documented in documentation/user-documentation/tab-types/audio-player.md (removed 2026-10-29)
* browser — documented in documentation/user-documentation/command-bar/browser.md, help/browser.md (removed 2026-10-29)
* cli — documented in documentation/user-documentation/getting-started/startup.md, documentation/user-documentation/workflows/creating-a-new-project.md (removed 2026-10-29)
* clipboard-history — documented in documentation/user-documentation/command-bar/clipboard.md, documentation/user-documentation/getting-started/keyboard.md, documentation/user-documentation/getting-started/context-menus.md, help/clipboard.md, help/commands.md, help/keys.md (removed 2026-10-29)
* command-queue — documented in documentation/user-documentation/command-bar/queue.md, documentation/user-documentation/getting-started/keyboard.md, documentation/user-documentation/advanced-agents/harness.md, documentation/user-documentation/automation/scheduling.md, help/queue.md (removed 2026-10-29)
* comments — documented in documentation/user-documentation/command-bar/commands.md (removed 2026-10-29)
* connection — documented in documentation/user-documentation/command-bar/connections.md, help/connection.md (removed 2026-10-29)
* context-menu — documented in documentation/user-documentation/getting-started/context-menus.md (removed 2026-10-29)
* conversations — documented in documentation/user-documentation/tab-types/conversations.md, documentation/user-documentation/command-bar/commands.md, help/conversation.md, help/conversations.md, help/commands.md (removed 2026-10-29)
* database — documented in documentation/user-documentation/tab-types/sql-browser.md, help/sql.md, help/db.md, help/commands.md (removed 2026-10-29)
* diff-tab — documented in documentation/user-documentation/tab-types/diff-tab.md, documentation/user-documentation/tab-types/diff.md, help/diff.md, help/commands.md (removed 2026-10-29)
* editor-plugins — documented in documentation/user-documentation/tab-types/editor.md (removed 2026-10-29)
* editor-tab — documented in documentation/user-documentation/tab-types/editor.md, documentation/user-documentation/tab-types/editor-persona-query.md, documentation/user-documentation/tab-types/editor-git-sync.md, help/edit.md, help/keys.md (removed 2026-10-29)
* embedded-web-page — documented in documentation/user-documentation/tab-types/web-pages.md, documentation/user-documentation/automation/monitoring.md (removed 2026-10-29)
* file-navigator-tab — documented in documentation/user-documentation/tab-types/file-navigator.md, documentation/user-documentation/getting-started/tabs.md, documentation/user-documentation/advanced-agents/remote-agents.md, help/files.md (removed 2026-10-29)
* harness — documented in documentation/user-documentation/advanced-agents/harness.md, documentation/user-documentation/advanced-agents/workspaced-agent.md, documentation/user-documentation/advanced-agents/remote-agents.md (removed 2026-10-29)
* harness-recording — documented in documentation/user-documentation/advanced-agents/harness.md, documentation/user-documentation/tab-types/recording-player.md, documentation/user-documentation/tab-types/notifications.md, documentation/user-documentation/automation/monitoring.md (removed 2026-10-29)
* history — documented in documentation/user-documentation/command-bar/history.md (removed 2026-10-29)
* image-tab — documented in documentation/user-documentation/tab-types/image-viewer.md (removed 2026-10-29)
* keyboard-navigation — documented in documentation/user-documentation/getting-started/keyboard.md, help/keys.md, documentation/user-documentation/command-bar/clipboard.md, documentation/user-documentation/command-bar/quick-open.md, documentation/user-documentation/command-bar/project-search.md (removed 2026-10-29)
* launcher — documented in documentation/user-documentation/tab-types/launcher.md, help/launcher.md, help/commands.md (removed 2026-10-29)
* markdown-rendering — documented in documentation/user-documentation/advanced-agents/markdown-rendering.md, documentation/user-documentation/automation/monitoring.md (removed 2026-10-29)
* markdown-tab — documented in documentation/user-documentation/tab-types/markdown-preview.md, documentation/user-documentation/getting-started/tabs.md (removed 2026-10-29)
* monitoring — documented in documentation/user-documentation/automation/monitoring.md, documentation/user-documentation/command-bar/connections.md, documentation/user-documentation/tab-types/editor.md, documentation/user-documentation/tab-types/web-pages.md (removed 2026-10-29)
* notifications — documented in documentation/user-documentation/tab-types/notifications.md (removed 2026-10-29)
* open — documented in documentation/user-documentation/tab-types/opening-files.md, help/open.md (removed 2026-10-29)
* pdf-tab — documented in documentation/user-documentation/tab-types/pdf-viewer.md, documentation/user-documentation/tab-types/opening-files.md, help/pdf.md, help/open.md (removed 2026-10-29)
* profiles — documented in documentation/user-documentation/automation/profiles.md, help/profile.md (removed 2026-10-29)
* pull-request-review — documented in documentation/user-documentation/workflows/pull-request-review.md, documentation/user-documentation/command-bar/tasks.md (removed 2026-10-29)
* pull-request-updating — documented in documentation/user-documentation/workflows/updating-a-pull-request.md, documentation/user-documentation/command-bar/tasks.md (removed 2026-10-29)
* pull-request-testing — documented in documentation/user-documentation/workflows/testing-a-pull-request.md, documentation/user-documentation/command-bar/tasks.md (removed 2026-10-29)
* quick-open — documented in documentation/user-documentation/command-bar/quick-open.md (removed 2026-10-29)
* quit-confirmation — documented in documentation/user-documentation/command-bar/commands.md, documentation/user-documentation/getting-started/tabs.md, help/quit.md, help/close.md (removed 2026-10-29)
* remote-server — documented in documentation/user-documentation/advanced-agents/remote-agents.md, documentation/user-documentation/tab-types/sessions.md, documentation/user-documentation/advanced-agents/tokens.md, documentation/user-documentation/command-bar/shell.md (removed 2026-10-29)
* roles — documented in documentation/user-documentation/tab-types/roles.md, help/roles.md, help/commands.md (removed 2026-10-29)
* root-path — documented in documentation/user-documentation/getting-started/tabs.md, help/open.md, help/edit.md, help/files.md (removed 2026-10-29)
* sandbox — documented in documentation/user-documentation/advanced-agents/harness.md, documentation/user-documentation/advanced-agents/workspacing.md (removed 2026-10-29)
* scheduling — documented in documentation/user-documentation/automation/scheduling.md, documentation/user-documentation/command-bar/commands.md, documentation/user-documentation/automation/profiles.md, help/schedule.md, help/scripts.md (removed 2026-10-29)
* scripts-tab — documented in documentation/user-documentation/tab-types/scripts.md, documentation/user-documentation/command-bar/commands.md, help/scripts.md (removed 2026-10-29)
* search-tab — documented in documentation/user-documentation/command-bar/project-search.md (removed 2026-10-29)
* transcript — documented in documentation/user-documentation/getting-started/tabs.md, documentation/user-documentation/getting-started/keyboard.md, documentation/user-documentation/advanced-agents/markdown-rendering.md, documentation/user-documentation/command-bar/history.md (removed 2026-10-30)
