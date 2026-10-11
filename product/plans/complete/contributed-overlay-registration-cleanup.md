# Preserve newer contributed-overlay registrations

**Complexity: 2/10** — the fix is a localized identity guard in the overlay registry with one focused regression case.

## Goal

Cleaning up an older contributed-overlay registration must leave a newer registration with the same name available.

## Approach

Keep the exact `Registration` object created by `registerContributedOverlay`. Its cleanup removes the registry entry and notifies subscribers only while that object is still the current value for the overlay name.

## Implementation steps

1. Guard registration cleanup by the identity of its `Registration` object.
2. Add a regression test that registers two overlays with the same name, cleans up the first, and confirms the second remains registered.
3. Update `product/specs/keyboard-navigation.md` to specify that stale cleanup does not remove a replacement overlay registration.

## Tests

- Verify cleanup of a replaced registration preserves the successor under the same name.
- Run `./scripts/run.mjs check-diff` after each implementation, test, spec, and backlog change.

## Out of scope

- Changing overlay name collision or replacement behavior.
- Changing plugin activation, claims, or teardown ordering.
