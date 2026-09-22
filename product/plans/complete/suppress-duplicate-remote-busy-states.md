# Suppress duplicate remote busy states

Complexity: 3/10

## Goal

Send remote busy-state updates only when busy or unread changes.

## Approach

Remember the last reported decision separately from the current busy snapshot so attach state remains authoritative.

## Implementation steps

1. Deduplicate repeated tracker decisions while retaining debounce and gate edges.
2. Add focused repeated-state tests.
3. Update the remote-server specification.

## Tests

- Cover repeated busy, ready, and gate decisions.

## Out of scope

- Changes to busy classification or attach snapshots.
