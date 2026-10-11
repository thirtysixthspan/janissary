# Report unavailable sandbox tests as skipped

**Complexity: 2/10** — the fix changes platform guards in one test file to Vitest's existing conditional-skip pattern.

## Goal

Sandbox-confinement tests that cannot run on the current platform are reported as skipped instead of passing without assertions.

## Approach

Replace each early return guarded by `sandboxAvailable()` in `src/sandbox/index.test.ts` with `it.skipIf(!sandboxAvailable())`. Keep platform-independent tests for sandbox profile constants and unconfined spawn behavior running on every platform.

## Implementation steps

1. Convert each sandbox-availability early return to Vitest's conditional skip on that test.
2. Run the scoped checks and confirm each confinement-only case is conditionally skipped by Vitest when sandboxing is unavailable.

## Tests

- Run `./scripts/run.mjs check-diff` and confirm the server tests pass on the current platform; verify the confinement-only tests use the conditional-skip form so unsupported platforms report them as skipped.

## Out of scope

- Changing sandbox behavior or profile contents.
- Adding a non-macOS implementation of sandbox confinement.
