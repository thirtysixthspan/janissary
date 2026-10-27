# Clarify restored-selection focus in pull request #1803

**Complexity: 1/10** — one sentence in the pull request description and one backlog entry. No code, test, spec, or documentation behavior changes.

## Goal

Correct the `What` paragraph in pull request #1803 so it distinguishes applying a restored selection from the normal focus behavior of the `files` command. Leave every other part of the description untouched.

## Approach

`openFilesCommand` opens a new center navigator or focuses an existing one. The completed feature plan and `product/specs/file-navigator-tab.md` describe that behavior. The PR's current focus sentence incorrectly implies that the issuing tab remains active. Replace only that sentence with: “Applying a restored selection does not change the normal focus behavior of the `files` command: opening or focusing a center navigator can still make it active.”

## Implementation steps

1. Verify the wording against `src/file-navigator/open-command.ts`, `product/plans/complete/restoring-a-file-trees-view-from-the-command-line.md`, and `product/specs/file-navigator-tab.md`.
2. After publishing the branch changes, replace only the named focus sentence in PR #1803's body. Compare the full body to confirm all other text is byte-for-byte unchanged.
3. Remove the selected entry whole from `product/backlog/pull-request.md`. Restore its exact comment-and-heading skeleton because it is the only entry.
4. Promote this plan through `ready/` to `complete/`, commit the plan and backlog changes on `cli/file-tree-view`, and push to that same branch. Leave the PR open.

## Tests

None added: this correction changes only PR prose and planning metadata, not behavior. Verify the sentence against the existing source, plan, and spec, and run the required diff-scoped checks after each change.

## Spec

`product/specs/file-navigator-tab.md` remains unchanged. It already distinguishes the selection clauses from the command's focus behavior; this change corrects only the PR description.

## Docs

None needed. `help/files.md` and the file-navigator user documentation describe the command and selection restoration without making the erroneous claim.

## Out of scope

- Any source, test, spec, or documentation changes.
- Any PR title change or change to other description text.
- Any change to file-navigator behavior.
- Any backlog entry other than the selected item or any file other than this PR's backlog.
