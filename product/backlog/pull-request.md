<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Use the editor's supported document-end shortcut in the quit-walk verification steps.

Existing Issue: Description steps D1 and D8 rely on Cmd+End to append edits, but the editor does not map that chord to document end, so D8 inserts `Z` before the existing gamma text instead of producing the expected `gamma gamma-editedZ`. Severity: 2/10

Existing Risk: 2/10 - Reviewers following the steps can mistake a bad test input for a broken quit walk and fail to verify the intended save behavior.

Proposal Risk: 1/10 - The corrected manual step could become stale if editor keyboard mappings change later.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1957 "Correct the quit-walk document-end shortcut in How to verify". D8 (description) currently says: “From a fresh instance arranged as in Setup, type `quit` from the shell tab, press `y` on alpha's dialog, then press `Escape` on gamma's dialog. Press Cmd+End (Ctrl+End on Linux) and type `Z`.” In the tested app this left gamma's buffer as `gamma-editedZgamma`, though the dialog Cancel correctly left gamma current and focused; a fresh diagnostic confirmed the focus behavior. The shared Setup also says to press Cmd+End before typing ` alpha-edited`, which affected D1 and D8. In `web/src/editor/keys.ts`, `metaAction` maps Meta+ArrowDown to document end, `ctrlAction` handles Ctrl+End, and `actionForKey` resolves those bindings; Meta+End has no document-end mapping. Correct the Setup instruction to “press Cmd+Down on macOS (Ctrl+End on Linux)” before appending, and correct D8 to use the same shortcut before typing `Z`; retain its expected buffer suffix ` gamma-editedZ`. Re-run D1 and D8 by hand and confirm the inserted text is at the end of each initial buffer.


* Reset the fixture files between independent quit-walk verification cases.

Existing Issue: Description steps D1, D2, D3, D5, D6, D8, D9, and D10 expect Setup's original file contents while Setup explicitly carries fixture files forward between numbered cases, so their exact disk assertions fail after earlier steps have saved edits or appended `external` lines. Severity: 3/10

Existing Risk: 3/10 - Reviewers can get misleading failures and cannot reliably distinguish a regression from state left by an earlier verification case.

Proposal Risk: 1/10 - A future case could still contaminate a later one if it shares a fixture outside the stated per-case work directory.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1957 "Reset quit-walk verification fixtures per case". D1, D2, D3, D5, D6, D8, D9, and D10 are description cases that assert Setup baselines after opening a “fresh instance”; for example D9 expects alpha and gamma to read `alpha` and `gamma`, while the isolated rerun preserved alpha's unchanged contents but found the stale file already contained multiple ` alpha-edited` and `external` lines. D6's last-tab dialog and exit/no-write behavior passed on a fresh rerun, and D10's overwrite prompt, dirty alpha state, and retry quit passed on an isolated rerun; both failed only their baseline assertion. D1, D2, D3, and D5 likewise preserved or saved the files as directed but observed prior case mutations. Setup says “The fixture files on disk stay as they are between steps unless a step says to change one,” which contradicts these independent baseline expectations. Replace that sentence with: “Every numbered case starts with its own copy of the Setup fixtures (`alpha.txt` contains `alpha`, `beta.txt` contains `beta`, and `gamma.txt` contains `gamma`; `photo.png` is the 480×240 landscape fixture). Keep that case's work directory across any restart within the case so its result can be inspected, then discard it before the next case. Apply an explicit disk change, such as appending `external`, only to that case's copy.” The tested app preserves Don't Save files and surfaces the overwrite conflict as specified; the shared mutable work directory is the cause. Re-run the affected cases with a separate work directory per case and assert both the intended app behavior and only that case's file state.
