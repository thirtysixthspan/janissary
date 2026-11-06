# Test remote termination clearing busy owners

**Complexity: 2/10** — adds one focused remote lifecycle test using the existing tab runtime helpers and attachment fixture.

## Goal

Verify remote process termination clears all busy-owner tokens from the affected tab and a late owner release remains harmless.

## Approach

- Extend `src/remote/attach.test.ts` using its `setup()` fixture and existing remote `exit` frame path.
- For a non-harness tab, wire the fixture's `TabManager.clearBusy` to the production `clearBusy` helper from `src/tab/runtime-operations.ts`.
- Acquire separate shell and ACP owner tokens through the production `addBusy` helper and confirm the tab runtime is busy before delivering the remote process `exit` frame.
- After termination, assert `runtime.busy` is false and `runtime.busyOwners` is empty. Call the production `deleteBusy` helper with one of the already-cleared tokens and confirm the tab remains idle.
- Keep the test focused on manager-to-runtime cleanup; retain the existing runtime helper test and remote notification coverage.

## Tests

- Add the focused remote termination case to `src/remote/attach.test.ts`.
- Run `./scripts/run.mjs check-diff` and confirm the relevant server tests pass.

## Specs and documentation

No spec or user documentation change is needed because this repair adds coverage for existing remote termination behavior without changing user-visible behavior.

## Out of scope

- Changing busy-owner runtime behavior or remote termination behavior.
- Changing remote process notifications, session teardown, or the tab busy projection.
