# Replace executable PR verification instructions with a summary

**Complexity: 2/10** — replace one pull request description section with concise prose and remove its single recorded backlog entry. No application behavior changes.

## Goal

Reduce the security risk of asking reviewers to run executable setup and verification instructions from an untrusted pull request checkout while keeping the scenarios and expected outcomes visible.

## Approach

Replace only the “How to verify” block in pull request #1803 with a short, non-executable summary of the local scenarios, fixture names, expected behavior, edge cases, and remote-view limitation. Keep the title and every other part of the description byte-for-byte unchanged. Do not include commands, code blocks, or instructions to operate on the checkout.

## Implementation steps

1. Preserve the PR’s existing description and replace only its setup and verification block with the summary.
2. Remove only this resolved entry from `product/backlog/pull-request.md`. Since it is the only entry, retain the exact leading comment and `# pull-request` heading skeleton.
3. Move this plan through draft and ready to complete, then publish the plan and backlog change on the existing PR head branch before editing the PR description.

## Tests

No application tests are needed because this change alters no application behavior. Run `check-diff` after each repository change. Before editing the PR, compare the prepared full body with the current body, confirm the only difference is the designated block, and verify the replacement contains no runnable commands or setup directions. After editing, read the body back and confirm the title and all text outside that block remain byte-for-byte unchanged.

## Spec

No spec change is needed; the pull request’s application behavior and the testing workflow do not change.

## Docs

None needed. The only public text change is the PR’s own verification section.

## Out of scope

- The PR title and every description paragraph outside the setup and verification block.
- Source code, tests, product specs, help, and user documentation.
- Any other entry in the PR backlog.
