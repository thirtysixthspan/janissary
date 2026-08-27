# documentation

## ready

## development

* application-config (3/10) — The configuration reference table in `documentation/user-documentation/getting-started/startup.md` lists seven of the eight settings the app reads, so 1 of about 12 facts is missing and none are wrong. Missing from the table: `externalViewers`, the object mapping each opener name to the macOS application that receives the file (defaulting to `{ "video": "QuickTime Player" }`, with an empty or missing entry handing the file to the OS default handler, and a user-supplied map replacing the default wholesale rather than merging with it). The key is documented in `documentation/user-documentation/tab-types/video-player.md`, so this is a completeness gap in the reference table rather than an undocumented feature — but a reference table a reader consults to see every available setting has to be exhaustive. Note also that `product/specs/application-config.md` is itself stale in the other direction: it omits `sandboxWorkspaces`, which the app does read and which the docs do list. Ground truth is `src/config.ts`. Fix by adding one `externalViewers` row to the config table in `startup.md`, cross-linking the video page for the worked example.

* profiles (3/10) — `documentation/user-documentation/automation/profiles.md` is detailed and accurate, with 2 of roughly 30 facts missing or stale and none outright wrong. Stale: the page says a `plugin` entry's `id` names "the built-in viewer that owns the tab — `image`, `markdown`, or `video`", but `profile save` also writes a `plugin` entry for the schedules list, so `schedules` belongs in that set; `product/specs/profiles.md` carries the same omission, and the audio tab is correctly excluded because its playlist is never captured. Missing: the page says Janissary "includes built-in profiles" without naming them, so a reader has no way to know `debugging`, `features`, `multitasking`, `planning`, and `product-review` exist short of running bare `profile launch` for the picker. Ground truth is `profiles/`, `product/specs/profiles.md`, and `src/profile/`. Fix by correcting the plugin `id` list and adding a short list of the shipped profile names to the "Writing a profile" or "Picking a profile to launch" section of `profiles.md`.

* harness — flagged by a `feat|fix` commit touching `src/` with no matching documentation commit in the same period (unread-badge suppression for a trailing recap line); not yet evaluated (over this run's limit)

* connection — flagged by a `feat|fix` commit touching `web/src/` with no matching documentation commit in the same period (reconnecting after a bfcache restoration); not yet evaluated (over this run's limit)

* video-tab — flagged by a `feat|fix` commit touching `web/src/` with no matching documentation commit in the same period (video tabs staying mounted so playback survives a tab switch); not yet evaluated (over this run's limit)

## deferred

## declined

## resolved

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
