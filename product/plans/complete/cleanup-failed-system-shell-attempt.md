# Clean up a failed system-shell attempt

**Complexity: 2/10** — the repair is limited to the existing ensure failure path, one focused regression test, and its behavior spec.

## Goal

When the shell command creates a system tab and then returns a rejected or failed outcome, close the attempt-owned tab and release its local PTY while preserving the original failure reason and the existing one-notice behavior.

## Approach

Use the existing captured-before tab set and reserved-label identity to identify the tab created by this ensure attempt. Non-success outcomes must clean up that tab without asking whether its shell PTY is valid: closing the tab releases every PTY owned by it, including a valid one. Keep the existing live-shell validation and invalid-attempt cleanup for successful outcomes, and never close a pre-existing tab occupying `system`.

## Implementation steps

1. In `src/system-shell.ts`, always close the newly opened attempt-owned `system` tab when `runCommandResult()` returns `rejected` or `failed`, then return the same outcome reason through `fail()`.
2. Add regression coverage in `src/system-shell.test.ts` for rejected and failed outcomes after a real valid shell tab and local PTY have been created. Verify tab and PTY cleanup, one notice with the original reason, and the surviving `janus` tab.
3. Update `product/specs/shell-tab.md` to describe cleanup of a partial shell creation failure.

## Tests

- Run the existing `src/system-shell.test.ts` cases, including live identity validation, invalid-attempt cleanup, pre-existing-label protection, and failure-reason preservation.
- Add cases for both rejected and failed outcomes after shell creation, asserting the tab is removed, its local PTY is no longer registered and is killed, one notice retains the original reason, and `janus` remains.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Changing the system-shell launch command, successful ensure behavior, notice wording, or pre-existing-tab handling.
- Changes to scheduling, shell lifecycle policy, help, or public user documentation.
