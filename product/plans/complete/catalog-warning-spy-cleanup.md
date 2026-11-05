# Catalog warning test spy cleanup

**Complexity: 1/10** — add per-test cleanup for the stderr spy in the catalog read tests.

## Goal

Prevent invalid-catalog warning tests from leaving `process.stderr.write` mocked for later tests.

## Approach

Restore mocks in the catalog read suite's `afterEach` hook. This runs even when a warning assertion fails and keeps the existing catalog warning and fallback coverage intact.

## Implementation steps

1. Add `vi.restoreAllMocks()` to the existing `afterEach` cleanup in `src/models/catalog-file.test.ts`.

## Tests

- Keep the invalid-JSON and malformed-record warning assertions and their bundled-catalog fallback assertions.
- Run `./scripts/run.mjs check-diff` for the test-only repair.

## Out of scope

- Changing catalog loading behavior or adding new user-facing behavior.
- Modifying other test files or documentation.
