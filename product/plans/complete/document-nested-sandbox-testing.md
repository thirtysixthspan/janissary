# Document nested sandbox testing

**Complexity: 1/10** — a focused correction to the sandboxed E2E browser runtime guide.

## Goal

Make clear how to test Janissary when the test process is already confined by a macOS Seatbelt sandbox.

## Approach

- Explain that macOS refuses to apply a nested Seatbelt profile.
- Direct test runs to keep the outer sandbox and disable Janissary's inner workspace sandbox with `sandboxWorkspaces: false`.

## Implementation

1. Add a concise nested-sandbox testing section to the sandboxed E2E browser guide.

## Tests

- Run `./scripts/run.mjs check-diff` to validate the documentation-only diff.

## Out of scope

- Changing workspace confinement, browser behavior, or the sandbox profile.
