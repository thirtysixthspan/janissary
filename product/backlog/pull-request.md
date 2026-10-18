<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Resolve the technical debt of a target guard that exists only in the scripts tab, so the schedules tab stops diverging on Enter from its focused header button.

Existing Issue: The guard that stops Enter from opening the selected row on a focused header button lives in a private helper in the scripts tab, while the schedules tab, copied from the same keydown handler, still opens the selected schedule's owner tab on Enter from its focused New schedule button, so the two list tabs now disagree on one keystroke and nothing shared holds the rule. Severity: 4/10

Existing Risk: 4/10 - A user who selects a schedule, tabs to New schedule, and presses Enter is sent to the owner tab instead of the dialog, and the next fix to the list keyboard rule will land in one tab's copy and not the other.

Proposal Risk: 2/10 - One guard that both list tabs import removes the divergence, and what remains is a future list tab that does not import it and repeats the defect.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1739 "share the list keyboard-ownership guard between the scripts and schedules tabs". Move the ownsKey function in web/src/plugins/scripts/ScriptsTab.tsx into a new module under web/src/shared/ beside list-selection.ts, taking the row class as a parameter so each tab passes the class its own row component renders, and re-export it from web/src/plugins/api.ts beside nextListSelection, which is additive so TAB_PLUGIN_API_VERSION does not move. Make ScriptsTab.tsx import it from ../api with the scripts row class, and make web/src/plugins/schedules/SchedulesTab.tsx apply it at the top of its onKeyDown with its own row class, so Enter on a focused New schedule button falls through to that button and a movement key pressed there no longer moves the schedules selection, matching the scripts tab. Add a case to web/src/plugins/schedules/SchedulesTab.test.tsx that clicks a row to select it, focuses the New schedule button, presses Enter with user-event, and expects openScheduleLaunch to be called and no focus-owner intent. Every existing test in ScriptsTab.test.tsx and SchedulesTab.test.tsx, including the one that fires Enter on the container, must keep passing untouched. Leave web/src/plugins/scripts/scripts-keys.ts and the schedules keys module unchanged.


* Close the technical debt of an untested target guard by pinning its row clause and its movement-key behavior with tests.

Existing Issue: The guard's row clause and its rejection of movement keys from a focused header button are both new in the commit, but the only test it adds presses Enter on the plus button, so a change to either branch passes the suite. Severity: 3/10

Existing Risk: 3/10 - A later edit that drops the row clause, widens which keys the list owns, or renames the row class the clause matches would reach users with every test still green.

Proposal Risk: 1/10 - With both cases pinned, a regression in either branch fails the suite, and what remains is a deliberate change to the trade-off, which must also edit these tests.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1739 "pin the target guard's row clause and its movement-key behavior with tests". In web/src/plugins/scripts/ScriptsTab.test.tsx, add a case inside the selection block that clicks a row to select it, then fires keyDown Enter with fireEvent on that row element itself and expects an open intent with that row's name, which exercises the row clause of the guard in web/src/plugins/scripts/ScriptsTab.tsx. Add a second case that clicks a row, focuses the New script button, fires keyDown ArrowDown on it, and expects the selected name to be unchanged and the fireEvent return value to be true, meaning the key was not prevented. Both cases pass against the current guard, so this work changes no source file. The existing container-based cases and the plus-button case must stay as they are. Do not edit web/src/plugins/scripts/ScriptsTab.tsx or web/src/plugins/scripts/scripts-keys.ts.
