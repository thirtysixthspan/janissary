# Correct named-close verification steps

## Complexity

3/10. This work corrects two manual verification items in the open PR description and removes their resolved backlog entry. The app behavior does not change.

## Goal

Make D12 and D15 runnable with the tab's actual `alpha.txt` label and an accurate expectation for the second browser window's clean editor buffer.

## Approach

Keep all application behavior unchanged. Replace only the D12 and D15 paragraphs in the PR description with the tested command and second-window sequence from the backlog proposal. Preserve the `Additional test cases` section and every other part of the description byte-for-byte.

The existing quit-confirmation spec already says that a tab that disappears during a walk is skipped, and the editor spec describes the editor buffer as an in-memory view. No spec or public documentation change is needed for a correction to the manual test procedure.

## Implementation steps

1. Remove this resolved entry from `product/backlog/pull-request.md`, preserving the exact empty skeleton.
2. After the backlog change is committed and pushed, replace only D12 and D15 in the PR description using `gh pr edit --body-file`.
3. Read the updated body back and confirm D12 uses `close alpha.txt`, D15 expects alpha to close directly in the second window, the first walk advances to gamma, the A1 additional case is unchanged, and every unrelated paragraph remains unchanged.

## Tests

- The previously recorded browser run confirmed `close alpha` reports no tab named `alpha`, while `close alpha.txt` closes the tab.
- The previously recorded two-window run confirmed the second window closes its clean `alpha.txt` without a prompt and the first window advances to gamma after its own alpha answer.
- After editing, compare the fetched PR body against its pre-edit content and verify that only D12 and D15 changed; verify the A1 section is preserved.
- Run `$janissary/scripts/run.mjs check-diff` after each repository change. No app tests are added because this work does not change app behavior.

## Out of scope

- Changes to app code, tests, or user-visible behavior.
- Changes to D11, the named-close cancellation behavior, the PR title, the `Additional test cases` section, or any other part of the PR description.
- Editing plans or specs for the already-resolved code fixes.
