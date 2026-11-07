<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the named-close examples to target the full filename and match the second-window state.

Existing Issue: D12 and D15 name the nonexistent tab `alpha` instead of `alpha.txt`, and D15 expects a close prompt in a second browser window whose editor buffer has no unsaved changes. Severity: 3/10

Existing Risk: 3/10 - Reviewers following these steps cannot trigger the described command or second-window prompt and may mistake the resulting mismatch for an app failure.

Proposal Risk: 2/10 - A stale filename or an inaccurate second-window expectation could make the verification steps unusable again.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1957 "Correct D12 and D15 named-close instructions". D12 (description) should read: “Closing one dirty tab while others remain still uses the single-tab dialog. Do: From a fresh instance, open `alpha.txt`, `beta.txt`, and the shell tab. Append ` alpha-edited` to alpha and make alpha current. Click alpha's × and press `Escape`. Click the shell tab's command bar, run `close alpha.txt`, and press `Escape` again. Expect: Both closes show \"Do you want to save changes to this file?\" with Save (y), Don't Save (n), and Cancel (Esc), not the walk title \"Do you want to save changes to alpha.txt?\". After each Escape, alpha remains open, current, and dirty, and no walk dialog or app exit occurs.” D15 (description) should read: “A tab that disappears mid-walk is skipped. Do: From a fresh instance arranged as in Setup, type `quit` from the shell tab so alpha's dialog is showing. Open a second browser window to the same instance, run `close alpha.txt` in its shell command bar, and confirm that alpha closes without a dialog in that window. In the first window, press `n` on alpha's dialog. Expect: The first window advances to \"Do you want to save changes to gamma.txt?\" with gamma current; press `Escape` and the app stays open.” The second browser window has a clean alpha editor buffer, so the command closes the tab directly; the first walk advances only after its own alpha answer is submitted.
