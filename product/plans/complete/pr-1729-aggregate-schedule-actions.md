# Verify Aggregate Schedule Deletion and Clear-All

Complexity: 2/10

## Goal

Extend the existing system-schedules management browser driver to verify keyed deletion of one duplicate project schedule and aggregate clearing across project and tab owners.

## Approach

Use app commands only to seed two same-name system schedules and one `janus` tab-owned schedule. Exercise keyed deletion with the rendered row's existing selection and Delete confirmation flow, then inspect the persisted system schedule store and rendered aggregate rows. Exercise Clear all schedules through its visible aggregate button and confirm the empty store, empty tab-owner list, and retained runscript file.

## Implementation steps

1. Extend `scripts/e2e/system-schedules-management.mjs` with mixed-owner setup, selected-row deletion, persisted-key and rendered-row assertions, aggregate clear-all, owner-empty checks, and runscript-retention verification.
2. Remove only the resolved first entry from `product/backlog/pull-request.md` and promote this plan to `product/plans/complete/`.

## Tests

- Run `./scripts/run.mjs check-diff` after the driver change and after the backlog/plan update.
- Run the system-schedules E2E build and management driver as supported by the repository's E2E runner.
- Confirm the driver remains at or below 200 source lines.

## Out of scope

- Changes to application behavior, plugin tests, functional specs, user documentation, PR description, or any other E2E driver.
