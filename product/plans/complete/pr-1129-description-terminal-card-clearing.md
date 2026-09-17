# PR 1129 — describe terminal-card selection clearing accurately

Complexity: 2/10

## Goal

The pull request description says tab switches clear every terminal selection, but transcript terminal cards do not have a tab-activity signal and intentionally retain their selection until resize or PTY exit.

## Approach

Correct only the description's clearing-trigger statement and behavior example to name the transcript-card exception. The existing behavior and the matching harness specification remain unchanged.

## Implementation steps

1. Update the pull request body so tab-owned terminal surfaces clear on tab switches, while terminal cards clear on resize and PTY exit.
2. Preserve every unrelated description paragraph and the pull request title exactly as written.

## Tests

- No automated test applies because this changes only the pull request description; inspect the revised body against `product/specs/harness.md`.

## Out of scope

- Changing terminal-card lifecycle behavior.
- Editing application source, tests, specifications, help, or user documentation.
