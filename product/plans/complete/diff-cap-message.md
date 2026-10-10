# Diff Cap Message

Complexity: 2/10

## Goal

Remove the over-cap line-count message while retaining automatic collapse for changes above the existing cap.

## Approach

Remove the header message and its styling, keep the 400-line collapse rule, and update tests and the diff tab spec to describe the silent collapsed state.

## Implementation steps

1. Remove the message from the file header and update over-cap tests.
2. Update the diff tab spec and remove the message styling.

## Tests

- An over-cap change starts closed without a line-count message.
- Cycling its view reveals the changed lines.
- A change at the cap remains visible.
- Run the diff-scoped check after each implementation step.

## Out of scope

- Changing the cap value or the behavior of the file-view cycle.
