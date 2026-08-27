# documentation

## ready

## development

* harness (6/10) — `documentation/user-documentation/advanced-agents/harness.md` covers launching, labels, workspaces, auto-approve, prompts, capture, transcripts, recordings, and monitoring, but says nothing about the busy dot or the unread badge, so about 8 of 30 facts are missing and none are wrong. `getting-started/tabs.md` explains both signals generically, which is what leaves the harness-specific behavior invisible. Missing: that the dot tracks what the harness is actually doing rather than whether its process is alive, that a newly launched harness starts busy until its first reading, that a working-to-idle transition commits only after two consecutive idle readings so a mid-generation pause never flickers the dot while a return to working is immediate, that a backgrounded harness's dot changes live without switching to the tab, that only a hidden tab is badged unread on going idle, that a recognized permission prompt stops the dot immediately and badges unread right away when nothing is going to answer it, that opencode has no prompt recognition so it badges on the normal debounce instead, and that for claude a trailing `recap:` summary line is exempted from the badge. Ground truth is `product/specs/harness.md` and `src/harness/`. Fix by adding a "What the dot and the badge tell you" section to `harness.md` that links back to the generic explanation in `tabs.md`.

* tabs (5/10) — `documentation/user-documentation/getting-started/tabs.md` is thorough, with roughly 1 of 30 facts wrong and none materially missing. Wrong: the rename section states that "Messaging, scheduling, and every other feature that targets a tab by name keeps using the original label", but `resolveTarget` matches a tab's display alias as well as its label, and `sendMessage` documents the same in its own comment, so `msg`, `broadcast`, `send`, `queue`, `close`/`exit`, `schedule … in <tab>`, and monitor targets all accept the alias. What is actually true is narrower: routing and queuing key off the canonical label internally, and the tab strip, `state`, and transcripts keep showing it. The `rename` command's own confirmation, `Tab "<label>" now displays as "<name>" (msg/routing still use "<label>")`, says the same misleading thing, so a fix should describe the behavior rather than quote that line as if it settled the question. Ground truth is `src/commands/resolve-target.ts`, `src/agent/communication-manager.ts`, and `src/commands/rename.ts`. Fix by rewriting that paragraph in `tabs.md`; the new `command-bar/send.md` already states the accurate version and the two pages currently disagree.

* video-tab (5/10) — `documentation/user-documentation/tab-types/video-player.md` is otherwise complete, with 2 of about 24 facts missing and 1 wrong. Wrong: the Lifecycle section says `profile save` doesn't record video tabs, but `writePluginEntry` captures any plugin tab and writes a `plugin` entry carrying the video's path, and `automation/profiles.md` correctly says videos are captured — the two pages contradict each other and the app follows the profiles page. Note `product/specs/video-tab.md` carries the same wrong claim, so the spec is stale here too. Missing: that only the tab you are looking at starts playing on open, so a video tab restored behind another after a page reload stays paused and switching to it later never starts it; and that playback continues in a split pane that doesn't hold keyboard focus. Also worth folding in: the page never mentions the `video <path>` command, which exists and appears only in `help.md`. Ground truth is `src/profile/save-entries.ts`, `product/specs/video-tab.md`, and `product/specs/profiles.md`. Fix by correcting the Lifecycle sentence and extending the playback section.

* workspaced-agent (4/10) — `documentation/user-documentation/advanced-agents/workspaced-agent.md` covers provisioning, tokens, and lifecycle well, so 1 of about 16 facts is missing and none are wrong. Missing: provisioning records the new clone as trusted in Claude's user configuration at `~/.claude.json`, and if that file cannot be read, holds malformed JSON, or has an invalid root, `projects`, or matching-project shape, provisioning fails and leaves the file byte-for-byte unchanged. The user-visible consequence is the one worth writing down — every workspaced tab fails to launch and closes itself until the file is repaired — because nothing on the page connects that failure to a file the user has never been told about. A missing configuration is created, and a valid one keeps all unrelated fields and per-project settings, so the failure only ever means the file is damaged. Ground truth is `src/workspace/index.ts` and `product/specs/workspaced-agent.md`. Fix by adding a short paragraph to the provisioning section of `workspaced-agent.md`, near the existing clone-failure sentence.

* open (3/10) — `documentation/user-documentation/tab-types/opening-files.md` is accurate and complete on dispatch, wildcards, and errors, so about 2 of 18 facts are missing and none are wrong. Missing: audio, which the page's example list and its links to the per-type pages both predate — `open track.mp3` now opens an audio tab covered by `documentation/user-documentation/tab-types/audio-player.md`, and this page is the hub a reader starts from; and that `edit` dispatches by file type, so `edit photo.png` opens the image editor while `edit Makefile` and `edit src/index.ts` still open the plain-text editor, with the accepted consequence that a PNG can no longer be opened as raw text. Both are small cross-reference gaps rather than undocumented behavior, but this page is where a reader looks to find out which file types do what. Note `product/specs/open.md` is itself stale in its opening paragraph, which lists the bundled openers as "Markdown, images, and video" and omits audio. Ground truth is `product/specs/open.md`, `src/open-route.ts`, and `src/plugins/catalog.ts`. Fix by adding an audio example and link to `opening-files.md` and a sentence on `edit` dispatch there.

## deferred

## declined

## resolved

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
