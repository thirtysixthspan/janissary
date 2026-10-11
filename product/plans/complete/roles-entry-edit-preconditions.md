# Reject stale positional role entry edits

Complexity: 6/10 (threshold: 7).

## Goal

Prevent queued removals, reorders, and effort changes from acting on a different entry after the displayed positions become stale.

## Approach

Require an expected ordered entry snapshot on every positional intent. Compare length and each entry's harness, model, and effort against the freshly read role inside the serialized edit queue. A mismatch republishes the current file, rejects with a retry message, and writes nothing. Capture snapshots in row controls and at drag start so a payload update during the gesture cannot replace the source precondition.

## Implementation steps

1. Extend intent types and guards in `src/plugins/roles/shared.ts`, add pure snapshot comparison in `role-edits.ts`, and check it in `activate.ts` before applying queued entry edits. Add snapshots to `RoleCard.tsx` controls and `roles-dnd.ts` drag payloads. Run `./scripts/run.mjs check-diff`; update existing intent tests to submit the required snapshot in this same step.
2. Add server guard and activation regressions for rapid removals, reorder then effort change, duplicate choices, effort-only changes, shared snapshots across callers, and successful retries. Add client tests for control snapshots, drag snapshots surviving publication, and visible stale rejection. Run `./scripts/run.mjs check-diff`.
3. Update `product/specs/roles.md` and the existing reorder/removal documentation, promote this plan, and restore the drained backlog to its exact comment-and-heading skeleton. Clarify that a write may be refused by a read-only directory, matching atomic replacement's permission boundary. Run `./scripts/run.mjs check-diff`, then commit and push to the same open PR.

## Tests

Two removals based on one three-entry snapshot must remove only the first requested entry and reject the second without rewriting the file. A reorder followed by a stale effort change must retain the reordered values and original efforts. Duplicate harness/model choices must be checked as a complete ordered list, including length and effort. Two caller capabilities sharing a snapshot must not apply both stale edits. A new displayed snapshot must permit retry after rejection. Guards reject missing, malformed, and partial snapshots. Client removal and effort controls submit the displayed entries; entry drags retain the start snapshot across a payload update and show a rejected retry message beneath the source line.

## Out of scope

Persistent entry identifiers, revision counters, cross-process filesystem arbitration, stale role reordering, automatic replay of refused edits, plugin API changes, and PR description changes.
