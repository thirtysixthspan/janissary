# documentation

## ready

* notifications (8/10) — 5 of 34 facts are missing and 2 are wrong across the feed reference and related feature pages. `documentation/user-documentation/tab-types/notifications.md` says there are four configurable ambient events, but the app also supports `notifications.events.rateLimited`, defaulting to false; add that setting and its rate-limit notification behavior to the reference and the summary in `documentation/user-documentation/command-bar/commands.md`. The reference also places a close button in the docked feed's header, whereas closing belongs to the sidebar tab strip and the header contains only the dock-cycle control. Add newest-first ordering, the compact 12-hour timestamp and originating-tab header, and focused-feed Arrow Up/Down and Page Up/Page Down scrolling. The other two missing facts are the once-per-tab `no harness transcript found` and `harness recording failed` messages; link to the harness-recording explanation and distinguish diagnostic notifications that bypass event toggles and focus suppression from ambient events, while retaining the documented drop-if-closed rule. Other event coverage already exists in `documentation/user-documentation/advanced-agents/harness.md`, `documentation/user-documentation/advanced-agents/agent-questions.md`, `documentation/user-documentation/tab-types/editor-persona-query.md`, `documentation/user-documentation/tab-types/file-navigator.md`, `documentation/user-documentation/tab-types/audio-player.md`, and `documentation/user-documentation/command-bar/plugins.md`, so cross-link those descriptions rather than duplicating them. Ground truth is `product/specs/notifications.md`, `src/config.ts`, `src/notifications.ts`, `web/src/NotificationsTab.tsx`, `web/src/notifications-handlers.ts`, `web/src/DockCycleHeader.tsx`, and `web/src/Sidebar.tsx`; `help.md` already covers the command forms. The spec contains a stale statement that docking displaces a different view, contradicted by its later sharing section and the shipped sidebar; preserve the user reference's correct shared-sidebar explanation.

* file-creation-commands (7/10) — The registered `newfile` and `newdir` commands have no dedicated spec or command reference: 8 of 12 facts are missing, 0 wrong, although their navigator-button workflows are documented in `documentation/user-documentation/tab-types/file-navigator.md`. Add `newfile <file>` and `newdir <directory>` to `documentation/user-documentation/tab-types/opening-files.md`, `documentation/user-documentation/command-bar/commands.md`, and `help.md`, with the exact bare-command errors `Usage: newfile <file>` and `Usage: newdir <directory>`. Explain that relative command paths use the issuing tab's working directory and that the remaining text is one literal path, including spaces, without wildcard expansion. Unlike `edit`, `newfile` always opens a new plain-text buffer even when the requested name has an image extension; `newdir` creates the directory immediately and requires its parent to exist rather than recursively creating ancestors. The four already-covered facts are collision suffixes such as `untitled-2.md`, a new file remaining unsaved until Save, immediate collision-safe directory creation, and the navigator buttons/`Cmd+N`/`Ctrl+N` alternative. Ground truth is `src/commands/index.ts`, `src/commands/new-file.ts`, `src/commands/new-directory.ts`, `src/open-file-manager.ts`, `src/openers/editor.ts`, `src/editor/next-free-name.ts`, `src/editor/save.ts`, and `web/src/editor/useEditorFile.ts`; the related `product/specs/open.md` describes open/edit dispatch but does not name either creation command. Use a short command-reference addition linked to the existing navigator workflow; the lower score in the greater-than-50%-missing band reflects that the ordinary UI route is already documented.

* harness-recording (5/10) — 7 of 27 facts are missing, 0 wrong; automatic recordings, playback, captures, transcript opening, and startup/relaunch retention are already covered in `documentation/user-documentation/advanced-agents/harness.md`, with remote behavior in `documentation/user-documentation/advanced-agents/remote-agents.md`. Extend the recording section to explain that an open or write failure abandons recording for that session without stopping the harness and reports `harness recording failed` once. Both that message and `ssh recording failed` bypass event opt-in and focused-tab suppression, but are dropped if the notifications feed is closed. Add the distinct once-per-tab `no harness transcript found` diagnostic, explaining that a missing or unrecognized session record leaves screen-based monitoring available without a transcript file. Also document that inline interactive PTYs such as `shell vim` are not recorded, terminal resizes are included in the recording, and transcript collection follows the current harness session rather than importing sessions that predate the tab. Cross-link the diagnostics from `documentation/user-documentation/tab-types/notifications.md`; `help.md` already advertises harness capture, and the existing harness guide documents `harness transcript <name>`. Ground truth is `product/specs/harness-recording.md`, `product/specs/notifications.md`, `src/harness/observers.ts`, `src/harness/recorder.ts`, `src/harness/transcript/tailer.ts`, `src/harness/transcript/sources.ts`, `src/harness/subcommands.ts`, and `src/notifications.ts`.

## development

## deferred

## declined

## resolved

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
