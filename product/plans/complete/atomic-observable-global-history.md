# Make global history persistence atomic and observable

**Complexity: 4/10** — one persistence module and its focused tests change, using the existing atomic writer and warning pattern. The command-history contract and UI remain unchanged.

## Goal

Global command-history updates must retain the last valid file when a write is interrupted, and malformed files or persistence failures must produce a bounded diagnostic.

## Approach

Use `atomicWriteFile` for initial creation and every history update. Track consecutive history-storage failures globally, emit only the first warning until a valid load or successful write recovers, and warn when malformed stored data is ignored.

## Implementation steps

1. Replace direct global-history writes with the shared atomic writer.
2. Add bounded warnings for malformed history and persistence failures, resetting suppression after recovery.
3. Extend global-history tests for atomic creation/update, retained valid data, malformed diagnostics, and bounded warning recovery.
4. Update the history spec, remove the backlog entry, and promote this plan after checks pass.

## Tests

- `src/global-history.test.ts`: initialization and record updates use atomic replacement; failed updates preserve the last valid file and warn once; a successful retry permits a later warning; malformed JSON and non-array data warn while yielding no loaded commands.
- Preserve load filtering, duplicate suppression, ordering, cap behavior, and round-trip coverage.

## Out of scope

- Recovering entries from an already-corrupt legacy file.
- Changing the global-history schema, cap, or duplicate rules.
- Changing per-agent history persistence.
- Adding an on-screen warning surface.
