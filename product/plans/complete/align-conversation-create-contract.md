# Align conversation create contract

## Complexity

2/10.

## Goal

Reconcile the plan's draft-carrying create contract with the implementation's payload-only draft transport.

## Approach

Remove the unused optional query field introduced by this PR from the conversations create action. The repository's only production producer is the conversation tab helper; the topic dispatcher and manager already accept only the identifier. Retain transient draft transport through the tab payload and acknowledgement lifecycle.

## Implementation steps

1. Remove query from the create variant in `src/plugins/api.ts`. Strengthen the default-menu creation assertion in `src/plugins/conversations/activate.test.ts` to assert the exact id-only action and draft-bearing tab, and add ordinary list-create coverage. Run `./scripts/run.mjs check-diff`.
2. Correct `product/plans/complete/chat-about-this.md` wherever it promises draft transport through the topic or manager, including the activation-test description. Document pending-draft retention through notifications and consumption cleanup. Update `product/specs/conversations.md` to distinguish an empty list-created composer from a selected-text composer.
3. Promote this plan, remove the resolved entry, check and push the existing PR.

## Tests

Default-menu creation emits exactly one id-only create action and opens a conversation payload with the unsent selection. List creation emits the same id-only action and opens a conversation payload with no draft. Existing notification and consumption tests must keep passing, along with type checks of every caller.

## Out of scope

Draft persistence, host API version changes for this unused addition on an open PR, unrelated plan claims, PR description changes, and merging. Help and public documentation do not describe selection-prefilled creation, so no updates are needed. No new comments.
