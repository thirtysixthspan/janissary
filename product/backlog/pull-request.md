<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Restore command-bar focus after cancelling a clean quit.

Existing Issue: D11's clean quit dialog closes on Escape, but the command line does not regain focus. Severity: 4/10

Existing Risk: 3/10 - A cancelled quit leaves users unable to continue typing until they refocus the command bar, a recoverable interruption.

Proposal Risk: 2/10 - If focus restoration remains untested, a later command-bar change could reintroduce the interruption.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1957 "Restore command-bar focus after cancelling a clean quit". D11 (description), verbatim: “No dirty tab shows the plain quit dialog. Do: From a fresh instance, with no edits made, type `quit` in the shell tab's command bar. Expect: The dialog reads \"Are you sure you want to quit?\" with Quit (y) and Cancel (n), Cancel selected, and no Save (y) button. Press `Escape`; the dialog closes, the app remains open, and focus returns to the command line.” At a 1280×800 browser viewport, run `quit` on a clean scratch instance and press Escape; the dialog closes but `document.activeElement` is `BODY` and neither Shell command textarea is focused, reproduced twice. `web/src/App.tsx` passes `inputReference` to `useQuitConfirm`, but the rendered command field belongs to `web/src/plugins/shell/ShellTab.tsx`, which creates a separate ref for `CommandBarShell`; `useQuitConfirm.cancelQuit` therefore focuses a null ref on its animation frame. Wire quit cancellation to the active shell's actual command input or a host focus handle, and add an App-level regression assertion that Escape restores command-line focus.


* Keep the cancelled dirty editor current after a named close.

Existing Issue: After cancelling a named close for an inactive dirty editor, the shell remains active instead of the editor whose dialog was cancelled. Severity: 5/10

Existing Risk: 4/10 - Users can resume typing in the wrong tab after cancelling, which makes subsequent commands or edits confusing.

Proposal Risk: 2/10 - A host-level focus regression could leave the editor inactive again if the named-close cancel path is not covered.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1957 "Keep the cancelled dirty tab current after a named close". D12 (description), verbatim: “Closing one dirty tab while others remain still uses the single-tab dialog. Do: From a fresh instance, open `alpha.txt`, `beta.txt`, and the shell tab. Append ` alpha-edited` to alpha and make alpha current. Click alpha's ×. Press `Escape`. Click the shell tab's command bar, run `close alpha`, and press `Escape` again. Expect: Both closes show \"Do you want to save changes to this file?\" with Save (y), Don't Save (n), and Cancel (Esc), not the walk title \"Do you want to save changes to alpha.txt?\". After each Escape, alpha remains open, current, and dirty, and no walk dialog or app exit occurs.” The literal `close alpha` is invalid for a tab labeled `alpha.txt`; using `close alpha.txt` opens the single-file dialog, and Escape leaves the `alpha alpha-edited` buffer intact but leaves `janus` active, while Escape from the preceding tab-strip dialog leaves alpha active. In `web/src/unsaved-work/CloseSaveGuard.tsx`, the close-mode `onCancel` handler dismisses the dialog and calls `handle?.focus()` without activating the requested tab; focusing a handle in an inactive tab cannot make its tab current. Activate the target tab before focusing its handle on cancel, and add a regression test that a cancelled named close returns the current tab to the dirty editor.


* Correct the named-close examples to target the full filename and match the second-window state.

Existing Issue: D12 and D15 name the nonexistent tab `alpha` instead of `alpha.txt`, and D15 expects a close prompt in a second browser window whose editor buffer has no unsaved changes. Severity: 3/10

Existing Risk: 3/10 - Reviewers following these steps cannot trigger the described command or second-window prompt and may mistake the resulting mismatch for an app failure.

Proposal Risk: 2/10 - A stale filename or an inaccurate second-window expectation could make the verification steps unusable again.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1957 "Correct D12 and D15 named-close instructions". D12 (description) should read: “Closing one dirty tab while others remain still uses the single-tab dialog. Do: From a fresh instance, open `alpha.txt`, `beta.txt`, and the shell tab. Append ` alpha-edited` to alpha and make alpha current. Click alpha's × and press `Escape`. Click the shell tab's command bar, run `close alpha.txt`, and press `Escape` again. Expect: Both closes show \"Do you want to save changes to this file?\" with Save (y), Don't Save (n), and Cancel (Esc), not the walk title \"Do you want to save changes to alpha.txt?\". After each Escape, alpha remains open, current, and dirty, and no walk dialog or app exit occurs.” D15 (description) should read: “A tab that disappears mid-walk is skipped. Do: From a fresh instance arranged as in Setup, type `quit` from the shell tab so alpha's dialog is showing. Open a second browser window to the same instance, run `close alpha.txt` in its shell command bar, and confirm that alpha closes without a dialog in that window. In the first window, press `n` on alpha's dialog. Expect: The first window advances to \"Do you want to save changes to gamma.txt?\" with gamma current; press `Escape` and the app stays open.” The second browser window has a clean alpha editor buffer, so the command closes the tab directly; the first walk advances only after its own alpha answer is submitted.
