# user documentation gaps

Last run: 2026-07-19 16:40 UTC

Functional areas where user documentation lags application behavior, scored 1–10 for the size of the mismatch (10 = completely undocumented).

## candidates

## unverified

* editor-tab — flagged by git log (live-reload of externally changed files, unsaved-changes warning, transient draft sync) against `documentation/user-documentation/tab-types/editor.md`; not yet evaluated (over this run's limit)
* embedded-web-page — flagged by git log (back/forward/reload buttons, editable address, address/label following) against `documentation/user-documentation/tab-types/web-pages.md`; not yet evaluated (over this run's limit)
* tabs — flagged by git log (metadata row with launch-agent, file-navigator, connections, and schedule buttons) against `documentation/user-documentation/getting-started/tabs.md`; not yet evaluated (over this run's limit)

## resolved

* sandbox — documented in `documentation/user-documentation/advanced-agents/workspacing.md` (added a bullet to the isolation list noting that credential-shaped environment variables like `AWS_*`, `GITHUB_TOKEN`, `NPM_TOKEN`, and `SSH_AUTH_SOCK` are also stripped from a sandboxed process) (removed 2026-07-19)

* harness-recording — documented in `documentation/user-documentation/advanced-agents/harness.md` (Recordings section now notes that keystroke input is never recorded, only output, and that the file is created lazily on first output so a harness that exits immediately leaves none) (removed 2026-07-19)

* transcript — documented in `documentation/user-documentation/getting-started/tabs.md` (new Reading the transcript section covering clickable `file:line` links, double-click re-run of a prompt line, ANSI-colored shell output with a screenshot, and the mouse wheel/scrollbar behavior; also noted that a single click, not just `Ctrl+T`, expands the collapsed tool-steps summary line) (removed 2026-07-19)

* ssh-tab — documented in `documentation/user-documentation/advanced-agents/harness.md` (SSH sessions section now covers the bare-`ssh` usage error, the pre-launch transcript recording that keeps a failed connect visible, the exit/last-tab-quits-app lifecycle, and the `shell ssh <host>` inline-card regression, linking to `connections.md` for the existing `connection close` matching rule instead of duplicating it); `help.md`'s `ssh` row already matched, no change needed (removed 2026-07-19)

* scheduling — documented in `documentation/user-documentation/automation/scheduling.md` (added a Seeing every schedule at once section for the `schedules` tab with a screenshot, a Scheduling from a dialog section for the web New schedule dialog, a metadata-bar clock button note, a busy-agent queuing note, and a scheduled-harness-launch-with-prompt example) and a `schedules` row in `help.md`'s Commands table (removed 2026-07-19)

* file-tree-tab — documented in `documentation/user-documentation/tab-types/file-navigator.md` (added a Finding a file by name section, a Moving files by drag-and-drop section covering the drag gesture and dropping onto the command bar, a Creating a new file section, and `Backspace`/`Delete` and `Cmd+N` rows to the Keyboard table; also corrected the `→` row, which wrongly said an expanded directory's first child gets selected — it re-roots the tree there) (removed 2026-07-19)

* cli — documented in `documentation/user-documentation/getting-started/startup.md` (added a Stopping the app section for `janus stop [<project-dir>]`, the detached-launch/Ctrl+C note, the `.janissary/log/server.log` truncate/append behavior, and the `--no-open` URL-printing note) (removed 2026-07-19)

* application-config — documented in `documentation/user-documentation/getting-started/startup.md` (added `sandboxWorkspaces` and `notifications` rows to the Configuration table; the `theme` key and the runtime-rewrite behavior were already present) (removed 2026-07-19)

* sidebars — documented in `documentation/user-documentation/getting-started/tabs.md` (new sidebar-strip section and screenshot), `documentation/user-documentation/tab-types/file-navigator.md`, and `documentation/user-documentation/tab-types/notifications.md` (both corrected to say sidebars share different-kind docked tabs instead of displacing them, and now mention the `schedules` tab as a third dockable kind) (removed 2026-07-19)

* harness — documented in `documentation/user-documentation/advanced-agents/harness.md` (corrected the bare-`harness` paragraph to note the New harness dialog, and added sections for the New harness dialog, model/effort metadata chips, `-y` auto-approve, `with <prompt>`, and `harness capture`); help.md already matched, no change needed (removed 2026-07-19)

* monitoring — documented in `documentation/user-documentation/automation/monitoring.md` (new page, registered in the sidebar), with a stale "SSH tabs can't be watched this way" sentence corrected in `documentation/user-documentation/advanced-agents/harness.md`, and a `data-doc-shot="reporting-tab"` tag added to `web/src/ReportingSection.tsx` for a future screenshot (removed 2026-07-19)

* messaging — documented in `documentation/user-documentation/command-bar/messaging.md` (new page, registered in the sidebar) (removed 2026-07-19)

* database — documented in `documentation/user-documentation/command-bar/database.md` (new page, registered in the sidebar) (removed 2026-07-19)

* connection — documented in `documentation/user-documentation/command-bar/connections.md` (new page, registered in the sidebar), with the `connection` row and Tab-completion note in `help.md` corrected to include ssh, and a cross-link fix in `documentation/user-documentation/command-bar/tab-completion.md` (removed 2026-07-19)

* browser — documented in `documentation/user-documentation/command-bar/browser.md` (new page, registered in the sidebar) (removed 2026-07-19)

* application-themes — documented in `documentation/user-documentation/command-bar/commands.md` (new `theme` section) and `documentation/user-documentation/getting-started/startup.md` (Configuration table) (removed 2026-07-19)

* acp — documented in `documentation/user-documentation/advanced-agents/acp-agent.md` (new page, registered in the sidebar), with the `acp` row in `help.md` extended to mention `acp reset` (removed 2026-07-19)

* quick-open — documented in `documentation/user-documentation/command-bar/quick-open.md` (new page, registered in the sidebar), with a `Cmd+P` row added to `help.md`'s Key Bindings table and a cross-link row in `documentation/user-documentation/getting-started/keyboard.md` (removed 2026-07-19)

* relaunch — the Resuming a session section of `documentation/user-documentation/getting-started/startup.md` accurately covers what `--relaunch` restores (tab order, colors, groups, transcripts, history, cwd, aliases, schedules) and what it does not (view tabs, harness tabs, workspaces), matching `product/specs/relaunch.md`; no gap (removed 2026-07-19)
