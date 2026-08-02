# documentation

## ready

* editor-tab (4/10) — The editor coverage in `documentation/user-documentation/tab-types/editor.md`, `documentation/user-documentation/tab-types/editor-git-sync.md`, and `documentation/user-documentation/tab-types/editor-persona-query.md` is accurate, including the recently fixed first external-change reload, but 4 of 20 facts are missing and none are wrong. The missing facts are transcript-log scrubbing for text-bearing editor input, visual-row cursor movement across soft-wrapped lines, IME composition handling, and the detailed caret/scroll rules that keep movement visible without snapping the viewport merely because a tab was reactivated. The ground truth is `product/specs/editor-tab.md`, `web/src/EditorTab.tsx`, `web/src/editor/keys.ts`, and `web/src/editor/useEditorWatchReload.ts`. Fix by adding concise keyboard/input and caret/scroll subsections to `documentation/user-documentation/tab-types/editor.md`; the Git-sync and persona-query pages need no change for this gap.

## development

## deferred

## declined

## resolved

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
