<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Close the technical debt of an untested target guard by pinning its row clause and its movement-key behavior with tests.

Existing Issue: The guard's row clause and its rejection of movement keys from a focused header button are both new in the commit, but the only test it adds presses Enter on the plus button, so a change to either branch passes the suite. Severity: 3/10

Existing Risk: 3/10 - A later edit that drops the row clause, widens which keys the list owns, or renames the row class the clause matches would reach users with every test still green.

Proposal Risk: 1/10 - With both cases pinned, a regression in either branch fails the suite, and what remains is a deliberate change to the trade-off, which must also edit these tests.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1739 "pin the target guard's row clause and its movement-key behavior with tests". In web/src/plugins/scripts/ScriptsTab.test.tsx, add a case inside the selection block that clicks a row to select it, then fires keyDown Enter with fireEvent on that row element itself and expects an open intent with that row's name, which exercises the row clause of the guard in web/src/plugins/scripts/ScriptsTab.tsx. Add a second case that clicks a row, focuses the New script button, fires keyDown ArrowDown on it, and expects the selected name to be unchanged and the fireEvent return value to be true, meaning the key was not prevented. Both cases pass against the current guard, so this work changes no source file. The existing container-based cases and the plus-button case must stay as they are. Do not edit web/src/plugins/scripts/ScriptsTab.tsx or web/src/plugins/scripts/scripts-keys.ts.
