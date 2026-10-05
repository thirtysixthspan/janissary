# Correct the shell-tab pull request description

**Complexity: 2/10** — a text correction to the pull request's own description. No source, test, or spec file changes.

## Goal

Make the shell-tab pull request description match its branch. A reviewer working from the description's file list should not hunt for deletions that never happened. They should also be asked to check the three user-visible behaviors that later commits added.

## Approach

The pull request description's "Files changed" section lists 42 `product/plans/complete/*.md` files as "remove the consolidated fix plan". None of those files exists on master or on the branch, and none appears in `git diff origin/master...HEAD --name-only`. The section also omits six files the diff does contain: three follow-up plans, the branch's own pull-request backlog, and the shell command-input formatter with its test.

Three behaviors that `product/specs/shell-tab.md` now specifies are missing from "What" and "How to verify":

- With the terminal focused, `Ctrl+Shift+C` (or `Cmd+C` on macOS) copies the selection through the shared clipboard writer.
- A multi-line command routed to zsh is sent as one bracketed paste and one submit key.
- The status hooks the tab installs are kept out of the shell's command history.

The fix is applied with `gh pr edit --body-file` after the branch is pushed, per Step 8 of `ai/tasks/work-an-issue.md`. Every paragraph the backlog entry does not name stays exactly as the author wrote it, and the title is not touched.

## Implementation steps

1. Read the current body with `gh pr view 1526 --json body`.
2. In "Files changed", delete every bullet ending "remove the consolidated fix plan".
3. In "Product records", add bullets for `product/backlog/pull-request.md`, `product/plans/complete/shell-tab-ignore-startup-history.md`, `product/plans/complete/shell-tab-keyboard-copy.md`, and `product/plans/complete/shell-tab-multiline-submit.md`.
4. In "Web client", add one bullet for `web/src/plugins/shell/shell-command-input.test.ts` and `web/src/plugins/shell/shell-command-input.ts`.
5. In "What", add one sentence each for the terminal copy chord, the bracketed-paste multi-line submission, and the setup hooks being kept out of shell history.
6. In "How to verify", add one sentence each for the same three behaviors.
7. Check every added path against `git diff origin/master...HEAD --name-only`, write the body to `./temp/pr-body.md`, and apply it with `gh pr edit 1526 --body-file ./temp/pr-body.md` after the push.

## Tests

None. Nothing under `src/` or `web/src/` changes, so there is no behavior for a test to cover. The added file paths are checked against the branch diff before the body is applied.

## Out of scope

- The pull request title.
- Description bullets the backlog entry does not name. The branch gained many commits after the review, so other bullets may be stale too. That includes files named in the body but missing from the diff (`web/src/TabItem.tsx`, `web/src/plugins/shell/insert-command-at-caret.ts`, `web/src/pickers/picker/overlay-props.test.ts`) and later plans and modules not listed. Correcting those would need its own entry.
- Specs, `help.md`, and user documentation: no behavior changes.
