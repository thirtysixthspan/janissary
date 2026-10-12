# Retain agent workspace ownership when final removal fails

**Complexity: 4/10** — the change is confined to the lease release closure and its tests. It preserves the existing reference-count model and only changes when the final lease is marked released and its directory is forgotten.

## Goal

A failed strict removal of a borrowed workspace must leave the lease and directory tracked so the same release callback can retry, and shutdown cleanup can still find the workspace. A successful release remains idempotent, and borrowed references continue to defer final removal.

## Approach

`acquireAgentLease` currently marks its closure released before decrementing or removing, then deletes the final directory entry before `removeWorkspaceStrict` runs. Move the released-state transition until the selected release operation has completed. For a final reference, run strict removal first, then delete the reference and mark the closure released. If removal throws, leave both intact so invoking the closure again retries the operation. The manager's existing tracked-reference cleanup can also see the directory after a failure.

## Implementation steps

1. Update `WorkspaceManager.acquireAgentLease` to mark a closure released only after its decrement or strict removal succeeds, and to delete the final reference only after strict removal succeeds.
2. Add focused tests proving a failed strict removal leaves the directory borrowable and the same release callback can retry successfully and becomes idempotent afterward. Keep coverage for release while another reference remains.

## Tests

- In `src/workspace/manager.test.ts`, simulate a strict removal that throws once and then succeeds. Assert the failed attempt rejects, another lease can still be acquired for the tracked directory, a retry of the original callback removes it, and later calls do not remove it again.
- Verify the acquired additional lease retains the workspace until it is released, preserving borrowed-reference behavior.
- Run `./scripts/run.mjs check-diff` after the implementation and tests, and after the spec update.

## Spec updates

- Update `product/specs/workspaced-agent.md` to state that a failed final borrowed-workspace removal remains tracked for retry or shutdown cleanup.

## Out of scope

- Changes to ordinary workspace release, best-effort removal, reference ownership, provisioning, or user-facing workspace behavior beyond retrying a failed final borrowed-workspace removal.
- Changes to help or user documentation, which do not describe this internal cleanup failure behavior.
