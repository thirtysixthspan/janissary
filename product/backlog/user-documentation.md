# user documentation gaps

Last run: 2026-07-19 16:40 UTC

Functional areas where user documentation lags application behavior, scored 1–10 for the size of the mismatch (10 = completely undocumented).

## candidates

* ssh-tab (6/10) — SSH tabs have no doc page of their own, but the SSH sessions section of `documentation/user-documentation/advanced-agents/harness.md` covers the basics (verbatim passthrough, labeling, `connection close ssh:<name>`, input/lifecycle by reference to harness tabs, no `as`/`-w`), so about 5 of 10 facts are missing, none wrong — rescored from 9 after the earlier run's filename-only check missed that section. Missing facts: the `Usage: ssh <destination> [ssh options].` error for a bare `ssh`; the launch command is recorded in the creator's transcript so a failed connect is still visible; `connection close ssh:<id>` matches label first, then destination when duplicates exist; the tab closes as soon as the ssh process exits and its error output dies with it, and closing the last tab quits the app; `shell ssh <host>` still opens an inline terminal card instead of a tab. The ground truth is `product/specs/ssh-tab.md` and the ssh handling in `src/`. Fix by expanding the SSH sessions section in `documentation/user-documentation/advanced-agents/harness.md` (or splitting it into a page under `documentation/user-documentation/tab-types/`) and verifying the `help.md` row still matches.

* transcript (6/10) — Transcript scrolling keys are documented in `documentation/user-documentation/getting-started/keyboard.md`, but about 6 of 12 facts are missing and no page explains the transcript's interactive behavior. Missing: `file:line` patterns in output (like `src/foo.ts:42`) are clickable and open the file in an editor tab at that line; double-clicking a previous command's prompt line re-runs it; agent tool steps appear collapsed as `N tool steps` with a click or `Ctrl+T` expanding them (keyboard.md has the key but not the behavior); the mouse wheel scrolls line by line; a scrollbar with a percentage appears in the prompt bar when scrolled up; ANSI-colored shell output renders with its colors. The ground truth is `product/specs/transcript.md`. Fix by adding a transcript section to an existing page (`documentation/user-documentation/getting-started/application.md` or `tabs.md`) or a short new page under `documentation/user-documentation/getting-started/`, covering the clickable links, re-run, and collapsed tool steps.

* harness-recording (3/10) — Harness session recording is well documented in the Recordings section of `documentation/user-documentation/advanced-agents/harness.md` (automatic recording, `.cast` files under `.janissary/recordings/`, naming, asciinema replay, cleared on fresh launch and kept on `--relaunch`, SSH excluded), with 2 of 8 facts missing, both minor. Missing: keystroke input is never recorded (output and resizes only — a privacy-relevant reassurance worth one sentence); the file is created lazily on first output, so a harness that dies instantly leaves no file. The ground truth is `product/specs/harness-recording.md`. Fix with one or two sentences in the existing Recordings section of `documentation/user-documentation/advanced-agents/harness.md`.

* sandbox (3/10) — The workspace sandbox is well documented for users in `documentation/user-documentation/advanced-agents/workspacing.md` (what works inside, write/read/secret blocking, `--offline`, the `sandboxWorkspaces` toggle, macOS-only, the not-active notice), with 1 of 10 user-facing facts missing. Missing: credential-shaped environment variables (`AWS_*`, `GITHUB_TOKEN`, `NPM_TOKEN`, `SSH_AUTH_SOCK`, and similar) are scrubbed from sandboxed processes, so a tool that needs them fails inside the workspace even though reads of the corresponding files are also blocked — worth a sentence so users understand why such tools fail. The deeper Seatbelt mechanics in the spec are engineering detail that does not belong in user docs. The ground truth is `product/specs/sandbox.md` and `src/sandbox.ts`. Fix with a sentence in the isolation list in `documentation/user-documentation/advanced-agents/workspacing.md`.

## unverified

* editor-tab — flagged by git log (live-reload of externally changed files, unsaved-changes warning, transient draft sync) against `documentation/user-documentation/tab-types/editor.md`; not yet evaluated (over this run's limit)
* embedded-web-page — flagged by git log (back/forward/reload buttons, editable address, address/label following) against `documentation/user-documentation/tab-types/web-pages.md`; not yet evaluated (over this run's limit)
* tabs — flagged by git log (metadata row with launch-agent, file-navigator, connections, and schedule buttons) against `documentation/user-documentation/getting-started/tabs.md`; not yet evaluated (over this run's limit)

## resolved

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
