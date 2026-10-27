# Replace executable PR verification instructions with a summary

**Complexity: 2/10** — replace one pull request description section with concise prose and remove its single recorded backlog entry. No application behavior changes.

## Goal

Reduce the security risk of asking reviewers to run executable setup and verification instructions from an untrusted pull request checkout while keeping the scenarios and expected outcomes visible.

## Approach

The “How to verify” block in pull request #1803 was replaced with a short, non-executable summary of the local scenarios, fixture names, expected behavior, edge cases, and remote-view limitation. The title and every other part of the description remained byte-for-byte unchanged. The summary contains no commands, code blocks, or checkout-operation instructions.

## Implementation steps

1. The PR’s existing description was preserved, and only its setup and verification block was replaced with the summary.
2. The resolved entry was removed from `product/backlog/pull-request.md`, retaining the leading comment and `# pull-request` heading skeleton.
3. The plan moved through draft and ready to complete. The plan and backlog change was published on the existing PR head branch before the PR description was updated.

## Tests

No application tests were needed because this change altered no application behavior. Diff-scoped checks passed after the repository changes. Before the PR update, the full body was compared with the current body; only the designated block differed, and the replacement contained no runnable commands or setup directions. A read-back confirmed the title and all text outside that block remained byte-for-byte unchanged.

## Spec

No spec change is needed; the pull request’s application behavior and the testing workflow do not change.

## Docs

None needed. The only public text change is the PR’s own verification section.

## Out of scope

- The PR title and every description paragraph outside the setup and verification block.
- Source code, tests, product specs, help, and user documentation.
- Any other entry in the PR backlog.
