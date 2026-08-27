# documentation

## ready

## development

* open (3/10) — `documentation/user-documentation/tab-types/opening-files.md` is accurate and complete on dispatch, wildcards, and errors, so about 2 of 18 facts are missing and none are wrong. Missing: audio, which the page's example list and its links to the per-type pages both predate — `open track.mp3` now opens an audio tab covered by `documentation/user-documentation/tab-types/audio-player.md`, and this page is the hub a reader starts from; and that `edit` dispatches by file type, so `edit photo.png` opens the image editor while `edit Makefile` and `edit src/index.ts` still open the plain-text editor, with the accepted consequence that a PNG can no longer be opened as raw text. Both are small cross-reference gaps rather than undocumented behavior, but this page is where a reader looks to find out which file types do what. Note `product/specs/open.md` is itself stale in its opening paragraph, which lists the bundled openers as "Markdown, images, and video" and omits audio. Ground truth is `product/specs/open.md`, `src/open-route.ts`, and `src/plugins/catalog.ts`. Fix by adding an audio example and link to `opening-files.md` and a sentence on `edit` dispatch there.

## deferred

## declined

## resolved

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
