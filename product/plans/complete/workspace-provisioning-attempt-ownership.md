# Bind workspace provisioning to its launch attempt

## Complexity

6/10. The race is localized to `WorkspaceManager`, with a small cancellation handle carried through existing tab and agent lifecycle paths. The provisioning and release APIs already expose the state needed to keep attempts separate.

## Goal

An older clone attempt cannot clear a replacement attempt's pending state, cancel it when its tab closes, return the wrong readiness promise, or deliver its credential notice to the replacement.

## Approach

Give every `create` call a distinct pending record and return an attempt-bound cancellation function. `trackReady` may notify or remove pending state only while its record remains current for that name. Propagate the bound cancellation through harness tabs, plugin launch cleanup, and agent workspace ownership. Preserve state-dirty emission and retained-workspace behavior.

## Implementation steps

1. Add attempt-specific pending records, guarded settlement, and cancellation in `WorkspaceManager`.
2. Carry the attempt-bound cancel function through harness-tab cleanup, plugin launch cleanup, and agent workspace execution.
3. Add controlled overlapping-attempt tests for old success and failure, replacement cancellation/readiness, and notice ownership.

## Tests

- An old attempt settling after replacement leaves the new attempt pending and its readiness promise intact.
- Closing or cancelling the old attempt cannot cancel a replacement attempt under the same name.
- An old OAuth failure notice is not attributed to the replacement; the current attempt still reports its own notice.
- Existing single-attempt, cancellation, retained-workspace, and release tests continue to pass.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Cancelling post-clone provisioning side effects beyond the clone operation itself.
- Changes to workspace naming, clone paths, or retained-workspace policy.
