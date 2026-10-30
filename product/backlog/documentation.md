# documentation

## ready

* transcript (6/10) — 17 of 26 documented fact groups are covered, 9 are missing, and none are wrong in the user docs. Add the useful transcript follow threshold/acceleration, ACP grouping edge cases, URL-with-port link handling, working-directory click boundary, and ANSI/link interaction to `documentation/user-documentation/getting-started/tabs.md`, `documentation/user-documentation/getting-started/keyboard.md`, `documentation/user-documentation/advanced-agents/markdown-rendering.md`, and `documentation/user-documentation/command-bar/history.md`. Evidence is `product/specs/transcript.md`, `web/src/shared/scroll-follow.ts`, `web/src/shared/transcript/useTranscriptPin.ts`, `web/src/shared/transcript/useTranscriptScroll.ts`, `src/buffer.ts`, `web/src/shared/transcript/open-link.ts`, `web/src/shared/transcript/transcript-line.tsx`, and `web/src/shared/transcript/ansi.ts`; omit stale spec-only claims such as a `Running...` line or a transcript scrollbar from user guidance.

* video-tab (3/10) — 29 of 31 facts are covered, 2 are missing, and none are wrong. Add a short view-only/no-command-bar note and a plain-language explanation that partial-range access keeps seeking responsive on large files to `documentation/user-documentation/tab-types/video-player.md`. Evidence is `product/specs/video-tab.md`, `src/open/route.ts`, `web/src/plugins/video/VideoTab.tsx`, and `web/src/plugins/video/video.css`; `help/video.md` covers command usage.

* websocket-rpc (6/10) — 10 of 14 facts are covered, 4 are missing, and none of the current user docs are wrong. Explain that an unanswered file-navigator mutation may have completed despite its lost reply, and that unanswered file search/Quick Open settles to an empty result; document the shell completion failure path without claiming typed input is preserved. Evidence is `product/specs/websocket-rpc.md`, `web/src/shared/ws/rpc-exchange.ts`, `src/message/file-navigator.ts`, `src/file-navigator/manager/item-operations.ts`, `web/src/file-navigator/useFileNavigatorSearch.ts`, `web/src/pickers/useQuickOpen.ts`, `web/src/plugins/shell/ShellTab.tsx`, and `web/src/plugins/plugin-client-capabilities.ts`; update `documentation/user-documentation/tab-types/file-navigator.md`, `documentation/user-documentation/command-bar/quick-open.md`, `documentation/user-documentation/command-bar/tab-completion.md`, and `help/files.md`.

* workspaced-agent (4/10) — 33 of 42 user-facing facts are covered, 9 are missing, and none of the allowed docs are wrong. Add shell/harness clone-depth and `--no-workspace` precedence, exact shell fallback/failure messages, Kilo credential-variable guidance, and OpenCode OAuth scope/failure details to `documentation/user-documentation/advanced-agents/workspaced-agent.md`, `documentation/user-documentation/advanced-agents/remote-agents.md`, and `documentation/user-documentation/advanced-agents/tokens.md`. Evidence is `product/specs/workspaced-agent.md`, `src/workspace/clone-depth.ts`, `src/plugins/shell/parse-argument.ts`, `src/harness/command-parse.ts`, `src/plugins/shell/activate.ts`, `src/plugins/launch-tab.ts`, `src/project/tokens.ts`, `src/sandbox/environment.ts`, `src/sandbox/opencode-data.ts`, and `src/remote/serve-provision.ts`; the current guide already explains the `gh` credential fallback.

## development

## deferred

## declined

## resolved

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
