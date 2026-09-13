# Prove remembered conversation model

## Complexity

2/10.

## Goal

Deliver a remembered-model test that distinguishes restoration from the default model fallback.

## Approach

Replace the two weak remembered-model cases in `src/conversations/manager.test.ts` with focused restoration, retired-model fallback, and persistence cases. Select an available pair distinct from the default and assert the fixture's distinction. Use a fresh store to read each persisted selection, and dispose every fixture in finally blocks so subscriptions are released even after an assertion fails.

## Implementation steps

1. Strengthen the manager tests without changing model selection implementation. Run `./scripts/run.mjs check-diff`.
2. Update `product/specs/conversations.md` to state that rejected selections do not change the remembered model. Promote the plan, remove the resolved entry, check and push the PR.

## Tests

Create a new conversation with a nondefault remembered pair in the same manager and again after disposing it and constructing a fresh manager against the same storage root. Preserve retired-model fallback to the first available catalog pair. Observe every successful selection's persistence write, including reselecting the same pair, and verify the stored value from a fresh store. Unknown conversations and unavailable models must not rewrite the remembered pair. Preserve existing session-switch and conversation persistence tests.

## Out of scope

Model catalogs, manager implementation, other backlog entries, and merging. No help or public documentation changes are needed because the new spec sentence concerns rejected requests. No new comments.
