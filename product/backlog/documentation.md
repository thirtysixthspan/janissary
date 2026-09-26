# documentation

## ready

## development

* web-pages (7/10) — 10 of 20 facts missing and 1 wrong, the wrong one on the page's core close behavior. `documentation/user-documentation/tab-types/web-pages.md` says "Four routes, same result" and lists the tab's × button, `close`, `close <name>`, and `Cmd+W`/`Ctrl+W`, omitting the metadata header's own close button that the same page describes two sections earlier, so a reader counting the routes is short one. The missing facts are the tab's creation in the active tab's group with a distinct dot color, that opening a page writes no transcript line, that a profile captures a page tab by address and reopens it, that a typed address failing validation is silently discarded leaving the tab where it was, that navigating by typing the address keeps the tab's name, strip position, and group, that switching away and back never reloads the embedded page, that de-duplication matches the address the page is on now rather than the one it opened on, that the strip's close control removes the tab without also selecting it, that closing restores focus to the previously focused tab and falls back to an adjacent one, that `close` with no argument closes the active tab, and the rule that a page tab cannot be dragged out of the group it was opened from. The ground truth is `product/specs/embedded-web-page.md`, `src/plugins/page/`, and `web/src/plugins/page/PageTab.tsx`. Fix by extending `documentation/user-documentation/tab-types/web-pages.md`, and note that the grouping rule is overstated in the spec the same way it is for `image-tab`.

* markdown-tab (7/10) — 9 of 22 facts missing and 1 wrong, the wrong one on the page's most visible characteristic. `documentation/user-documentation/tab-types/markdown-preview.md` says the file "is rendered as a document page — white background, dark text", but `web/src/plugins/markdown/markdown.css` colors the stage from the active application theme, so a reader on a light theme is told to expect the wrong thing. The missing facts are the tab's creation in the active tab's group with a distinct dot color, the header's Split action, that a profile can capture a markdown tab and reopen it, the selection highlight staying distinct from the background, scroll keys being ignored by a markdown tab that is not on screen, a newly opened tab starting scrolled to the top, scroll position not being restored by `janus --relaunch`, the internal label being `markdown`, `markdown-2`, … behind the file name shown in the strip, the strip close control removing the tab without also selecting it, and the rule that a markdown tab cannot be dragged out of the group it was opened from. The ground truth is `product/specs/markdown-tab.md`, `src/plugins/markdown/`, and `web/src/plugins/markdown/markdown.css`. Fix by correcting the appearance sentence and extending `documentation/user-documentation/tab-types/markdown-preview.md`.

* audio-tab (6/10) — 7 of 23 facts missing and none wrong. `documentation/user-documentation/tab-types/audio-player.md` covers the playlist, the transport controls, the formats, and the file-navigator entry thoroughly, but leaves out that the tab is created in the active tab's group with a distinct dot color and takes focus, that it has no shell, agent session, transcript, or command history, that a profile neither records nor reopens it, that a malformed select or remove request is refused and the tab keeps working, that a plugin failure disables the plugin, closes the audio tab, and reports the standard failure message, how the tab reads in the strip, and the rule that it cannot be dragged out of the group it was opened from. The previous run's dockability flag is resolved and is not a gap: `product/specs/audio-tab.md` says the tab is dockable "through the host's dock control", but the dock-cycle control in `web/src/DockCycleHeader.tsx` renders only once a tab is already docked and the audio plugin declares no `dockTab` capability, so no user-reachable affordance docks an audio tab and the spec is the thing that is wrong. The ground truth is `product/specs/audio-tab.md`, `src/plugins/audio/`, and `web/src/plugins/DockCycleHeader.tsx`. Fix by extending `documentation/user-documentation/tab-types/audio-player.md`.

* video-tab (5/10) — 8 of 26 facts missing and none wrong. `documentation/user-documentation/tab-types/video-player.md` covers playback, capture, and the external player well, but never gives the two verbatim strings a user searches for: the player is replaced by `This video cannot be played in the app.`, and the fallback button reads `Open in <player>` when a player is configured and `Open externally` when none is, per `web/src/plugins/video/VideoTab.tsx`. The other missing facts are the tab's creation in the active tab's group with a distinct dot color, the header's Split action, the player being fitted to the tab with its aspect ratio preserved, a capture not being opened automatically, a malformed capture or external-open request being refused while the tab keeps working, a plugin failure disabling the plugin and closing every video tab, how the tab reads in the strip, and the rule that it cannot be dragged out of the group it was opened from. `product/specs/video-tab.md` is stale in claiming a profile does not record a video tab; `product/specs/profiles.md` and the app both record one as a `plugin` entry, which the doc page already gets right. The ground truth is `product/specs/video-tab.md`, `src/plugins/video/`, and `web/src/plugins/video/VideoTab.tsx`. Fix by adding the two verbatim strings and extending `documentation/user-documentation/tab-types/video-player.md`.

* agent-command-queue (4/10) — 4 of 22 facts missing and none wrong. `documentation/user-documentation/command-bar/queue.md` is close to complete, but leaves out that a dequeued command finishing synchronously without making the tab busy again does not stall the drain, that drained shell output carries no working-directory artifacts leaked in from adjacent commands in the same drain, that a keystroke editing a row is dropped rather than misapplied when the queue drains that same row out from under the popup, and that `Backspace` on an empty line clamps the selection. The ground truth is `product/specs/agent-command-queue.md` and `src/tab/queue.ts`. Fix by extending the drain and popup sections of `documentation/user-documentation/command-bar/queue.md`.

* notifications (3/10) — 3 of 30 facts missing and none wrong. `documentation/user-documentation/tab-types/notifications.md` is the best-covered page in the set, leaving only that the tab label on an agent-question notification is a link that focuses the asking tab, that a harness launched with `-y` auto-approving one of its own prompts raises the `auto-approve` event, and that a notification never makes a sound or an operating-system-level notification. The ground truth is `product/specs/notifications.md` and `src/notifications/`. Fix by extending `documentation/user-documentation/tab-types/notifications.md`.

* quick-open (3/10) — 3 of 16 facts missing and none wrong. `documentation/user-documentation/command-bar/quick-open.md` leaves out that a match whose characters are consecutive or fall right after a `/`, `-`, `_`, `.`, or a camelCase boundary outranks a scattered one, that a shorter path breaks a score tie, and that a file list arriving after the window has been closed is discarded rather than reopening the window. The ground truth is `product/specs/quick-open.md` and `web/src/pickers/QuickOpen.tsx`. Fix by extending the filter section of `documentation/user-documentation/command-bar/quick-open.md`.

* remote-server — flagged by the spec-to-page ratio: a 645-line spec against a 153-line page, none wrong on a spot check; not yet evaluated (over this run's limit)

* workspacing — flagged by the spec-to-page ratio: a 461-line sandbox spec against a 34-line page, none wrong on a spot check; not yet evaluated (over this run's limit)

* editor-tab — flagged by the spec-to-page ratio: a 641-line spec spread across three pages; not yet evaluated (over this run's limit)

* file-navigator-tab — flagged by the spec-to-page ratio: a 901-line spec against a 323-line page; not yet evaluated (over this run's limit)

* harness — flagged by the spec-to-page ratio: an 832-line spec against a 341-line page; not yet evaluated (over this run's limit)

## deferred

## declined

## resolved

* open — documented in documentation/user-documentation/tab-types/opening-files.md, help.md (removed 2026-09-26)
* tab-completion — documented in documentation/user-documentation/command-bar/tab-completion.md, documentation/user-documentation/command-bar/messaging.md, help.md; product/specs/tab-completion.md is stale on the msg/broadcast candidates and the harness, schedule, syntax and search rules (removed 2026-09-26)
* browser — documented in documentation/user-documentation/command-bar/browser.md; product/specs/browser.md should record that `browser open`'s `name` argument is never read and that `content` reads `textContent` (removed 2026-09-26)
* database — documented in documentation/user-documentation/command-bar/database.md; product/specs/command-routing.md is the origin of the wrong `db <sql>` prefix claim (removed 2026-09-26)
* image-tab — documented in documentation/user-documentation/tab-types/image-viewer.md; product/specs/image-tab.md overstates the grouping rule, since web/src/useTabReorder.ts lets a tab in the root group be dropped anywhere in the strip (removed 2026-09-26)
* task-picker — documented in documentation/user-documentation/command-bar/tasks.md (removed 2026-09-26)
* context-menu — documented in documentation/user-documentation/getting-started/context-menus.md (removed 2026-09-26)
* history — documented in documentation/user-documentation/command-bar/history.md; product/specs/history.md does not state the `##` comment stripping (removed 2026-09-26)
* markdown-rendering — documented in documentation/user-documentation/advanced-agents/markdown-rendering.md (removed 2026-09-26)
* sidebars — documented in documentation/user-documentation/getting-started/tabs.md (removed 2026-09-26)
* application-state — documented in documentation/user-documentation/getting-started/agents.md (removed 2026-09-25)
* file-navigator-tab — documented in documentation/user-documentation/tab-types/file-navigator.md (removed 2026-09-25)
* scheduling — the fix(schedule) commit restored documented behavior (schedules already said to survive `janus --relaunch`); no doc change was needed (removed 2026-09-25)
* shell — documented in documentation/user-documentation/command-bar/shell.md (removed 2026-09-25)
* tabs — the feat(launch) change is the same one already worked as `agents`; documentation/user-documentation/getting-started/tabs.md was corrected there (removed 2026-09-25)
* editor-tab — documented in documentation/user-documentation/tab-types/editor.md, help.md (removed 2026-09-25)
* profiles — documented in documentation/user-documentation/automation/profiles.md (removed 2026-09-25)
* monitoring — documented in documentation/user-documentation/automation/monitoring.md (removed 2026-09-25)
* workspaced-agent — documented in documentation/user-documentation/advanced-agents/workspaced-agent.md (removed 2026-09-25)
* keyboard-navigation — documented in documentation/user-documentation/getting-started/keyboard.md, help.md (removed 2026-09-25)
* notifications — documented in documentation/user-documentation/tab-types/notifications.md (removed 2026-09-25)
* messaging — documented in documentation/user-documentation/command-bar/messaging.md (removed 2026-09-25)
* remote-server — documented in documentation/user-documentation/advanced-agents/remote-agents.md (removed 2026-09-25)
* harness — documented in documentation/user-documentation/advanced-agents/harness.md (removed 2026-09-25)
* agents — documented in documentation/user-documentation/getting-started/agents.md, documentation/user-documentation/getting-started/tabs.md (removed 2026-09-25)
* commit-to-origin — documented in documentation/user-documentation/tab-types/editor.md, documentation/user-documentation/tab-types/file-navigator.md (removed 2026-09-21)
* sessions-tab — documented in documentation/user-documentation/tab-types/sessions.md, help.md, documentation/user-documentation/advanced-agents/remote-agents.md (removed 2026-09-21)
* sleep-and-resume — documented in documentation/user-documentation/getting-started/sleep-and-resume.md, documentation/user-documentation/automation/scheduling.md, documentation/user-documentation/tab-types/notifications.md, documentation/user-documentation/advanced-agents/remote-agents.md (removed 2026-09-21)
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
