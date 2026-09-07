# Bind remote lifecycle callbacks to their shared entry

**Complexity: 4/10.** Local lifecycle repair in the remote manager.

## Goal

Keep joined tabs correctly attached until their transport ends, even after the creator closes or its label is reused.

## Approach

Capture the entry itself in readiness, failure, and close callbacks. Notify only handlers still owned by that entry. Detach all matching aliases and clear ownership before close callbacks run, with an explicit closed guard for repeated or reentrant cleanup.

## Implementation steps

1. Update `src/remote/manager.ts` to use stable entry ownership, retain transport reassignment, and share final-owner cleanup with transport-exit cleanup. Run check-diff.
2. Extend `src/remote/manager.test.ts` with lifecycle regressions. Run check-diff, including existing channel tests.
3. Clarify surviving-tab disconnect behavior in `product/specs/remote-server.md` and the existing remote-agent documentation. Promote this plan and remove the resolved backlog entry. Run check-diff and ship through the prescribed merge workflow.

## Tests

Cover creator release followed by transport exit, repeated exits and cache cleanup, reentrant owner callbacks, creator-label reuse during readiness, workspace failure and protocol error, and final-owner release before readiness. Preserve existing last-owner shutdown and channel exactly-once coverage.

## Out of scope

Transport protocol changes, reconnect support, workspace cache identity redesign, and other backlog entries.
