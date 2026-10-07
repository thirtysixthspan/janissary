# Make restored shell labels collision-safe

**Complexity: 3/10**

## Goal

Restored remote shell tabs use unique labels when another open tab already holds a saved label.

## Approach

Apply the existing `claimLabel` helper to every restored shell process before invoking the plugin reattach hook. The helper already matches the collision handling used for restored agent tabs.

## Implementation steps

1. Update `src/sessions/restore-tabs.ts` to resolve all shell labels through `claimLabel`.
2. Extend `src/sessions/shell-roundtrip.test.ts` with an occupied sibling label and verify the recorded PTY is still used under the unique label.

## Tests

- Run `./scripts/run.mjs check-diff` after the change.

## Spec

`product/specs/remote-server.md` already specifies that attached tabs reclaim recorded labels with de-duplication when another tab has claimed one.

## Out of scope

Changing label assignment for harnesses, agents, or shell launches outside session restoration.
