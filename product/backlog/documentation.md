# documentation

## ready

* websocket-rpc (10/10) — There is no matching page under `documentation/user-documentation/` and no coverage in `help.md`, so 12 of 12 documentable facts are missing. Those facts include the required `t: "rpc"`, numeric `id`, recognized `method`, and object-valued `params` envelope; silent dropping of malformed JSON, unknown methods, and invalid params without closing the socket; recovery on a later valid frame; and `rpc-reply` error semantics for synchronous dispatch failures. The ground truth is `product/specs/websocket-rpc.md`, `src/client-message.ts`, `src/index.ts`, `src/message-handler.ts`, and `src/protocol.ts`. Fix by adding an advanced reference page such as `documentation/user-documentation/advanced-agents/websocket-rpc.md` that documents the accepted envelope, invalid-frame behavior, and normal, deferred, and error reply shapes. This should be a topic in developer documentation, not user documentation.

* file-navigator-copy-and-paste (8/10) — `documentation/user-documentation/tab-types/file-navigator.md` has no clipboard section and `help.md` omits the copy, cut, and paste chords, leaving 11 of 12 facts missing and 1 wrong. Missing facts include the app-wide clipboard, `Cmd`/`Ctrl+C`, `X`, and `V`, cursor-derived paste destinations, copy-versus-cut marks and clipboard lifetime, same-directory auto-numbering, cross-navigator pastes, conflict choices, failure handling, and undo/redo semantics; the wrong fact says failed file operations open a result dialog when they now post one summarized notifications-feed line. The ground truth is `product/specs/file-navigator-tab.md`, `web/src/file-navigator-chords.ts`, `web/src/file-navigator-clipboard.ts`, `src/file-navigator/paste.ts`, and `src/file-navigator/operation-report.ts`. Fix by adding a copying, cutting, and pasting section and correcting the shared failure-reporting text in `documentation/user-documentation/tab-types/file-navigator.md`, then adding the three chords to the file-navigator controls in `help.md`.

* file-navigator-detail-modes (8/10) — The existing `documentation/user-documentation/tab-types/file-navigator.md` page and `help.md` have no row-detail coverage, so 11 of 11 facts are missing. The absent behavior includes `files with name|size|modified|permissions`, clause ordering and retargeting an existing tree, the per-tree default and header-button cycle, next-mode tooltips, compact size/time/permission formats, blank unavailable values, filename-first overflow, and profile restoration of the selected mode. The ground truth is `product/specs/file-navigator-tab.md`, `src/file-navigator/args.ts`, `web/src/file-navigator-detail.ts`, and `src/profile/files.ts`. Fix by adding a row-detail modes section to `documentation/user-documentation/tab-types/file-navigator.md` and expanding the `files` row in `help.md` with the `with <mode>` syntax.

* workspaced-agent (6/10) — `documentation/user-documentation/advanced-agents/workspaced-agent.md`, `documentation/user-documentation/advanced-agents/workspacing.md`, `documentation/user-documentation/getting-started/tabs.md`, and `help.md` correctly cover the basic commands, isolation, token setup, and high-level lifecycle, but 4 of 12 facts are missing and none are wrong. The missing facts are that a direct workspace launch creates a busy tab immediately and queues input until cloning finishes, when ready and failure notices appear and why a failed half-created tab closes automatically, how closing or shutting down cancels and cleans up an in-flight clone, and how the clone-local credential-helper reset prevents an inherited keychain credential from causing a 403 despite a valid `GH_TOKEN`. The ground truth is `product/specs/workspaced-agent.md`, `src/workspace/manager.ts`, `src/workspace/provision-wire.ts`, and `src/workspace/index.ts`. Fix by expanding the provisioning and lifecycle sections of `documentation/user-documentation/advanced-agents/workspaced-agent.md` and adding the stale-keychain 403 case to its GitHub-token guidance.

* editor-tab (4/10) — The editor coverage in `documentation/user-documentation/tab-types/editor.md`, `documentation/user-documentation/tab-types/editor-git-sync.md`, and `documentation/user-documentation/tab-types/editor-persona-query.md` is accurate, including the recently fixed first external-change reload, but 4 of 20 facts are missing and none are wrong. The missing facts are transcript-log scrubbing for text-bearing editor input, visual-row cursor movement across soft-wrapped lines, IME composition handling, and the detailed caret/scroll rules that keep movement visible without snapping the viewport merely because a tab was reactivated. The ground truth is `product/specs/editor-tab.md`, `web/src/EditorTab.tsx`, `web/src/editor/keys.ts`, and `web/src/editor/useEditorWatchReload.ts`. Fix by adding concise keyboard/input and caret/scroll subsections to `documentation/user-documentation/tab-types/editor.md`; the Git-sync and persona-query pages need no change for this gap.

## development

## deferred

## declined

## resolved

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
