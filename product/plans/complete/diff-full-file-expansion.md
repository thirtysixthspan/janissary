# Full-file diff expansion

Complexity: 7/10

## Goal

Allow reviewers to show every line of a changed text file in the diff itself, preserving change markings and the existing navigation and comment interactions, and return to the condensed diff.

## Approach

Use the diff's existing context read to request enough surrounding lines to cover the complete file. Keep this state per file and per tab session. Add a file-level control that switches between condensed and full-file views, visibly indicates the pending request, and preserves the current scroll position when the expanded payload arrives. Continue rendering the same diff hunks and line components so syntax highlighting, line numbers, comments, selection, and changed-line navigation remain available.

## Implementation steps

1. Add a full-file context intent and per-file session state, including returning a file to the initial three-line context.
2. Add the full-file/condensed control and preserve the diff body's scroll position through the payload update.
3. Cover the server intent/state, control behavior, and scroll preservation; update the diff tab spec and this plan; remove the resolved backlog item.

## Tests

- Server tests verify full-file context reaches the file's beginning and end and can be reset to the initial diff.
- Client tests verify both control states, pending behavior, intent payloads, and scroll preservation while expanded lines appear.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Expanding only selected boundaries or changing the existing per-file context-widening behavior.
- Editing file content, persisting comments, or opening a separate file viewer.
