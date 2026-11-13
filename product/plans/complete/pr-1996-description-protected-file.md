# PR 1996 description: Protected file refusal

**Complexity: 1/10** — A description-only correction to one pull request body; no code, tests, specs, or docs change.

## Goal

State in PR #1996's description that `file write` and `file edit` refuse any target inside a `.janissary` or `.git` folder with `Protected file: <path>.`, and give reviewers a How-to-verify step for it.

## Approach

`src/file-read/policy.ts` `checkProtectedPath` and `src/file-write/target.ts` `checkMutablePath` already refuse these targets in any letter case and through symbolic links before any folder is created; `help/file.md` and `product/specs/acp.md` already describe it. Only the PR body is missing the boundary. Apply the edit after pushing, through `gh pr edit --body-file`, preserving every other paragraph and the title.

## Implementation steps

1. Remove the resolved entry from `product/backlog/pull-request.md`, leaving the other entries unchanged, and push to the PR head branch.
2. In the "The problem it solves" paragraph, add a sentence describing the Protected file refusal and why those folders are protected; note reads and editor saves are unaffected.
3. Add `file write {"path":".git/hooks/pre-commit","content":"x"}` printing `Protected file: .git/hooks/pre-commit.` to the Behavior examples refusal block.
4. Add an Edge cases step to How to verify that creates `.git/` in `verify-write/` and runs the same command, expecting the Protected file line and no `hooks` folder; renumber the following steps.

## Tests

No code changes. Existing tests in `src/file-write/target.test.ts`, `src/file-write/filesystem.test.ts`, `src/file-write/edit.test.ts` and `src/remote/serve-file-navigator.test.ts` pin the behavior. Compare the applied body with the intended edit.

## Out of scope

Other backlog entries, code, specs, help, title changes, and merging.
