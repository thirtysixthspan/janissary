# Diff Tab View Cycle

Complexity: 6/10

## Goal

Give each diff file one arrows-up-down control that cycles closed, compact diff, and full-file views. Remove the whole-file hint and the incremental and per-boundary context controls and their behavior.

## Approach

Keep disclosure state in each file entry and use the existing full-file context request as the expanded state. Remove incremental and boundary expansion from the plugin contract, session, and Git read path. The normal three-line diff remains the compact state. Keep the separate size-cap note for the recorded follow-up item.

## Implementation steps

1. Replace the chevron with a Font Awesome arrows-up-down button that cycles closed, compact, and expanded views; remove the whole-file note.
2. Remove incremental and boundary context controls and their server/client intent, payload, and diff-read support.
3. Update and run focused client and server tests for the cycle and retained full-file behavior.
4. Update the diff-tab spec to match the new control and removed context behavior.

## Tests

- DiffTab tests for cycling a collapsed file to compact, full-file, then closed.
- Plugin tests confirming the full-file intent still works and removed context intents are rejected by the contract.
- Server tests for full-file expansion and standard three-line diff reads.
- Run the diff-scoped check after each implementation step.

## Out of scope

- Removing the over-cap line-count message; it is a separate backlog entry.
- Changing diff syntax highlighting, line navigation, or inline comments.
