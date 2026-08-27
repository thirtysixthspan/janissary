# Add a profile command failure path

**Complexity: 5/10** — the missing rejection handling is localized to the profile command router, with focused manager tests for the two asynchronous actions. Existing save and launch implementations remain unchanged.

## Goal

Every asynchronous profile save or launch must finish its issuing transcript command with either the existing success summary or one clear failure result, without producing an unhandled rejection.

## Approach

Introduce one private command wrapper in `ProfileManager` that owns a profile action promise, catches any rejection, normalizes its reason, and appends a consistent user-visible failure. Route both save and launch through it while preserving their existing success reporting.

## Implementation steps

1. Add a shared asynchronous profile-action wrapper and failure formatter to `ProfileManager`.
2. Route profile save and launch promises through the wrapper.
3. Add manager tests for rejected save and launch actions and preserved success behavior.
4. Document the command failure result in the profiles spec, remove the backlog entry, and promote this plan after checks pass.

## Tests

- `src/profile/manager.test.ts`: a rejected profile save appends one failure result; a rejected profile launch appends one failure result; neither rejection escapes; existing asynchronous success still reports normally.

## Out of scope

- Recovering or rolling back tabs partially opened before a launch fails.
- Changing specific validation, missing-profile, or semantic skip messages.
- Changing profile save capture, serialization, or layout behavior.
- Adding notifications in addition to the issuing transcript result.
