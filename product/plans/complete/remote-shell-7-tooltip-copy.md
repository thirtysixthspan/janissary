# Match the remote harness provisioning tooltip copy

**Complexity: 1/10** — align two documentation strings and one pull request description sentence with the existing UI tooltip.

## Goal

Use the exact remote harness button tooltip, `Waiting for the workspace`, in the feature description and documentation.

## Approach

Keep the UI behavior unchanged. Correct the wording in the remote server functional spec and the tabs user guide, then update the matching sentence in PR #1581's Behavior examples section without changing the surrounding description.

## Implementation steps

1. Update `product/specs/remote-server.md` and `documentation/user-documentation/getting-started/tabs.md` to say `Waiting for the workspace`.
2. Update the PR description's matching sentence to use the same exact string.
3. Remove the resolved entry from `product/backlog/pull-request.md`; restore the file to its comment-and-heading skeleton when no entries remain.

## Tests

No new test is needed. `web/src/harness/HarnessTab.test.tsx` already checks the exact tooltip string. Run `./scripts/run.mjs check-diff` and verify the wording in the two docs and PR description.

## Out of scope

Changing the UI tooltip, behavior, or existing test.
