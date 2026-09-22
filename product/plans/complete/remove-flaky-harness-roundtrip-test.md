# Remove flaky harness round-trip test

## Complexity

2/10

## Goal

Remove the intermittently failing final-harness-transport shutdown test so it no longer destabilizes the test signal.

## Approach

Delete only `delivers shutdown before closing the final harness transport` from the harness session round-trip suite. The neighboring joined-tab release test continues to cover shutdown delivery when the final attached tab closes.

## Implementation steps

1. Remove the identified flaky test case from `src/sessions/harness-roundtrip.test.ts`.
2. Remove the resolved backlog entry.

## Tests

Run the diff-scoped check and retain the neighboring final-release shutdown coverage.

## Out of scope

Changing remote shutdown behavior, timers, or harness-session production code.
