<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle the new Space/p shortcut so it cannot toggle a schedule when a focused button owns the key.

Existing Issue: With a row selected, a Space keydown on the focused New schedule button — or on a pause button belonging to a different row — is consumed by the tab's onKeyDown, which prevents the button's own activation and toggles the selected row instead. Severity: 6/10

Existing Risk: 6/10 - A keyboard user who selects a row and then tabs to New schedule pauses or resumes that schedule instead of opening the dialog, and a user who tabs to one row's pause control can change a different row's schedule; the wrong recurring entry is mutated and persisted without the user noticing.

Proposal Risk: 2/10 - A target check confines the shortcut to the list container and leaves native button activation intact; the only residual risk is that the long-standing key handling on other focused buttons stays as it was.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2253 "keep the schedules tab Space/p shortcut from hijacking focused buttons". In web/src/plugins/schedules/SchedulesTab.tsx, guard the new Space/p branch of onKeyDown so it acts only when the event target is the list container itself — the same target check `ownsKey` in web/src/plugins/scripts/ScriptsTab.tsx uses — rather than any descendant button, leaving the selection and delete-dialog key paths as they are. Add colocated tests in web/src/plugins/schedules/SchedulesTab.test.tsx that select a recurring system row, focus the New schedule button, press Space, and assert openScheduleLaunch fires with no pause or resume intent, plus one that focuses a second row's pause button and asserts that button's row — not the selected one — is toggled. The existing pause/resume keyboard tests in that file drive keyDown on the list container and must keep passing unchanged.


* Update the schedules-tab spec to describe the new pause and resume controls and their shortcuts.

Existing Issue: The schedules tab section of product/specs/scheduling.md inventories the row controls and keys but says nothing about the per-row pause/resume button, the Space/p shortcuts, or the muted paused-row state this change adds. Severity: 4/10

Existing Risk: 4/10 - The spec is declared authoritative, so a reader following its control inventory will not know the list can pause and resume system schedules and will assume the trash icon and selection keys are the only row interactions.

Proposal Risk: 2/10 - The spec will match the controls once updated, with only the residual risk that the prose has to stay in step with later UI changes.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2253 "document the schedules tab pause and resume controls in the spec". In product/specs/scheduling.md, extend the paragraph describing the tab's live list and row controls to state that each recurring system row carries a pause/resume icon that sends the system-row pause or resume action by key without changing the selection, that a paused row shows `paused` as its next run with a muted style, and that Space or p on a selected row toggles it; keep the existing statements about click, double-click, Enter, arrows, Backspace/Delete, and the trash icon intact. In product/specs/scripts-tab.md, add Space, p, and the pause icon to the paragraph recording the schedules tab's keyboard-target divergence so it no longer omits the newly affected keys and control. Make no source behavior changes; the colocated tests in web/src/plugins/schedules/SchedulesTab.test.tsx pin these controls and must keep passing.


* Share the duplicated row icon button style added for the pause control.

Existing Issue: The new .schedules-row-pause rule in web/src/plugins/schedules/schedules.css repeats all eight declarations of .schedules-row-delete instead of sharing them, creating a second copy of the same icon-button reset. Severity: 2/10

Existing Risk: 3/10 - A future hover, focus, or color change applied to one of the two adjacent row icons will drift from the other, leaving inconsistent controls that the stylesheet tests do not catch.

Proposal Risk: 1/10 - A single shared class backs both icons so later styling applies to both, with only the residual risk of the test string that names the old class.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2253 "share the schedules row icon button style". In web/src/plugins/schedules/schedules.css, combine the identical declarations of .schedules-row-delete and .schedules-row-pause into one shared rule — either a common class applied to both buttons or a comma-separated selector — leaving the grid-column change and the .schedules-row.paused styling untouched. In web/src/plugins/schedules/SchedulesRows.tsx, keep the existing class names on the pause and delete buttons and add the shared class to each. Update web/src/plugins/schedules/schedules-style.test.ts so it still pins the new pause styling without depending on the duplicated declaration block, and keep its other assertions passing.
