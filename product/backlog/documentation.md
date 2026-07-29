# documentation

## ready

* ssh-tab (5/10) — 5 of 17 facts missing, none wrong. Coverage exists but lives inside `documentation/user-documentation/advanced-agents/harness.md` under "SSH sessions" rather than on a page of its own, and it is good: the `ssh <destination>` syntax, verbatim passthrough to the real binary, the bare-host label, the connections-panel `ssh:<destination>` row, `connection close ssh:<name>`, the usage error, the creator-transcript recording, the close-on-exit lifecycle, `send`/schedule delivery, the absence of `as` and `-w`, and the `shell ssh <host>` inline-card carve-out. `documentation/user-documentation/command-bar/connections.md` adds the global `connection list` rows. Undocumented: that an `ssh://` scheme prefix is stripped from the destination and a trailing `:port` is stripped from the label; that duplicate labels are disambiguated with `-2`, `-3`, …; that `connection close ssh:<id>` matches the tab's unique label before its destination, which is what distinguishes two `ssh devbox` tabs, and returns `No open connection ssh:<id>.` on no match; that the connections panel stays visible over an ssh tab even though ordinary harness tabs suppress it; and that ssh tabs are in-memory only and are not restored by `janus --relaunch`. Fix by adding these to the existing "SSH sessions" section rather than creating a page. The ground truth is `product/specs/ssh-tab.md`, `src/ssh.ts`, and `src/ssh-manager.ts`.

## development

* sandbox — flagged by a 190-line spec whose coverage is scattered across `documentation/user-documentation/advanced-agents/workspacing.md` and `workspaced-agent.md`; not yet evaluated fact-by-fact (over this run's limit)

* markdown-rendering — flagged by a 63-line spec with no page of its own beyond `documentation/user-documentation/tab-types/markdown-preview.md`, which covers the tab rather than the rendering rules; not yet evaluated (over this run's limit)

* keyboard-navigation — flagged by section-focus and chord behavior spread between `product/specs/keyboard-navigation.md` and a single `Shift+Tab` row in the docs; not yet evaluated (over this run's limit)

* agent-command-queue — flagged by git activity on queueing and the never-queue command list; not yet evaluated (over this run's limit)

* monitoring — flagged by sustained `feat(monitor)` activity since the last docs pass; not yet evaluated (over this run's limit)

## deferred

## resolved

* transcript — documented in documentation/user-documentation/getting-started/tabs.md (removed 2026-07-29)
* tab-reorder-drag — documented in documentation/user-documentation/getting-started/tabs.md (removed 2026-07-29)
* sidebars — documented in documentation/user-documentation/getting-started/tabs.md (removed 2026-07-29)
* harness-recording — documented in documentation/user-documentation/advanced-agents/harness.md, documentation/user-documentation/automation/monitoring.md (removed 2026-07-29)
* root-path — documented in documentation/user-documentation/getting-started/tabs.md (removed 2026-07-29)
* command-routing — documented in documentation/user-documentation/command-bar/shell.md, documentation/user-documentation/command-bar/database.md, documentation/user-documentation/advanced-agents/acp-agent.md (removed 2026-07-29)
* file-navigator-tab — documented in documentation/user-documentation/tab-types/file-navigator.md (removed 2026-07-29)
* append-only-log — documented in documentation/user-documentation/getting-started/activity-log.md (removed 2026-07-24)
