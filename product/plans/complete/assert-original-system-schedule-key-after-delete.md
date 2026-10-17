# assert original system schedule key after aggregate deletion

**Complexity: 2/10** — tighten one existing browser assertion by mapping the selected duplicate row to its persisted key, then state the aggregate deletion guarantee in the scheduling spec.

## Goal

Prove that deleting one of two same-named system schedules through the aggregate schedules UI leaves exactly the persisted key belonging to the unselected rendered row.

## Approach

Read the two persisted duplicate entries and their rendered schedule specifications before deletion. Resolve the selected row's schedule specification to one original entry and retain the other entry's key as the expected survivor. After confirming Delete, assert that the persisted duplicate keys are exactly that survivor key. Keep the rendered-row and tab-owned-row assertions in place.

## Implementation steps

1. In the system schedules management E2E, capture both duplicate keys, identify the selected row by its rendered schedule specification, and assert the store contains exactly the unselected entry's key after deletion.
2. Update the scheduling spec's aggregate deletion behavior to state that deleting a selected system row preserves the identity of any same-named unselected row.
3. Remove this completed item from the PR backlog, preserving the other entries.

## Tests

- Run `./scripts/run.mjs check-diff` to lint and typecheck the changed files and run affected tests.
- Run the focused system schedules E2E script test(s) available for this driver.

## Out of scope

- Changing schedule deletion implementation or UI behavior.
- Extending clear-all or restart coverage.
- Changing other PR backlog entries or PR metadata.
