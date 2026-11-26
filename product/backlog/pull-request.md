<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Share the duplicated row icon button style added for the pause control.

Existing Issue: The new .schedules-row-pause rule in web/src/plugins/schedules/schedules.css repeats all eight declarations of .schedules-row-delete instead of sharing them, creating a second copy of the same icon-button reset. Severity: 2/10

Existing Risk: 3/10 - A future hover, focus, or color change applied to one of the two adjacent row icons will drift from the other, leaving inconsistent controls that the stylesheet tests do not catch.

Proposal Risk: 1/10 - A single shared class backs both icons so later styling applies to both, with only the residual risk of the test string that names the old class.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2253 "share the schedules row icon button style". In web/src/plugins/schedules/schedules.css, combine the identical declarations of .schedules-row-delete and .schedules-row-pause into one shared rule — either a common class applied to both buttons or a comma-separated selector — leaving the grid-column change and the .schedules-row.paused styling untouched. In web/src/plugins/schedules/SchedulesRows.tsx, keep the existing class names on the pause and delete buttons and add the shared class to each. Update web/src/plugins/schedules/schedules-style.test.ts so it still pins the new pause styling without depending on the duplicated declaration block, and keep its other assertions passing.
