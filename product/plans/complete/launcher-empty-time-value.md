# Launcher: leave an inactive tab's time blank

**Complexity: 2/10** — change one pure formatter result, update its unit test, and document the visible empty state.

## Goal

Show no time text for a tab that has never been active instead of the word `never`.

## Approach

Have the relative-time formatter return an empty string for a non-positive activity timestamp. Keep its existing rendering and all elapsed-time formatting unchanged.

## Implementation steps

1. Change the formatter and its test for the never-active case.
2. Update the launcher spec to describe the blank value.
3. Promote this plan and remove the completed backlog entry.

## Tests

- Verify a non-positive timestamp formats as an empty string and existing relative-time cases remain unchanged.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Changing time rounding, thresholds, or labels for active tabs.
