# Correct the theme command claim in the pull request description

**Complexity: 1/10** — change one inaccurate phrase in the open pull request's manual-test description; no application behavior changes.

**Goal.** The pull request's Additional test case 3 accurately says that `theme dark` changes the application theme, not the syntax theme.

**Approach.** After pushing the plan and backlog update to the existing PR branch, edit only the named phrase in the pull request body. Preserve every other paragraph exactly as written. `src/commands/theme.ts`, `help.md`, and `product/plans/complete/shell-bar-theme-description.md` confirm that `theme dark` changes the application theme and `theme sync` changes syntax highlighting. `product/specs/application-commands.md` already describes this distinction accurately.

## Implementation steps

1. Make the wording correction in the PR description after the branch commit is pushed.
2. Confirm the PR remains open and the branch and description contain the intended change.

## Tests

- Verify the corrected claim against the theme command implementation, in-app help, and completed theme-description plan.
- Confirm all other PR body text remains unchanged.

## Out of scope

- Editing the PR title or any other part of its description.
- Changing command behavior, source code, specs, or help text.
