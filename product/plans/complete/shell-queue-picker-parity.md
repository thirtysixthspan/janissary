# Make the queue popup work in shell tabs

**Complexity: 6/10.** The app already owns queue state and the queue overlay, but both its eligibility check and overlay mounting exclude plugin shell tabs, whose command line also needs to edit the selected queued command.

## Goal

Let a shell tab open the shared queue popup, select and edit queued commands, delete a selected command, and close the popup with the same keyboard behavior as an agent tab.

## Approach

Reuse the application queue state and picker. Mount the existing picker over the active shell tab, expose queue state and edit callbacks through the existing plugin command-bar context, and make the shell bar mirror the selected queued command while queue mode is open.

## Implementation

1. Permit shell plugin tabs in the queue picker and avoid routing their selection into the hidden agent command bar.
2. Pass the shared picker overlay to the active shell plugin body and expose queue state and callbacks to the shell command bar.
3. Implement queue-mode draft synchronization, edits, empty-line deletion, and modal key handling in the shell tab.
4. Add shell-tab tests for opening, selection, editing, deleting, and closing the queue popup; update the shell tab spec.
5. Run the diff checks and remove the completed PR backlog entry.

## Tests

Run `./scripts/run.mjs check-diff` after each implementation step and after tests.

## Out of scope

Changing queue behavior on agent tabs or extending queue access to other plugin tabs.
