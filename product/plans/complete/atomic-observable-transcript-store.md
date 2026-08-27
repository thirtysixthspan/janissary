# Make transcript persistence atomic and observable

**Complexity: 4/10** — the persistence boundary is one small store with an existing shared atomic writer and focused tests. The change does not alter transcript data or relaunch selection semantics.

## Goal

Transcript saves and per-tab clears must never replace the last valid relaunch transcript with a partial file. Persistence failures must emit a bounded diagnostic rather than remaining invisible.

## Approach

Route both full-log saves and empty-log clears through `atomicWriteFile`. Track labels whose latest persistence attempt failed, warn only on the first consecutive failure for each label, and clear that suppression after a successful replacement so a later independent failure is reported again.

## Implementation steps

1. Replace in-place transcript writes with a shared private persistence path backed by `atomicWriteFile`.
2. Add per-label consecutive-failure tracking and stderr warnings for failed persistence.
3. Add atomic replacement and bounded-warning tests.
4. Record the relaunch durability behavior in the state-directory spec, remove the backlog entry, and promote this plan after checks pass.

## Tests

- `src/transcript/store.test.ts`: save and clear use atomic replacement; a failed replacement leaves the previous valid transcript readable; repeated failures warn once; a successful retry resets warning suppression.
- Preserve the existing load, directory creation, clearing, and bus subscription coverage.

## Out of scope

- Changing transcript JSON format or retention policy.
- Changing agent-state persistence or relaunch precedence.
- Adding asynchronous persistence or write queues.
- Changing whole-store deletion at normal startup.
