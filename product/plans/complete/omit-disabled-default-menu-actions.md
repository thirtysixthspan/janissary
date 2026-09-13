# Omit disabled default-menu actions

## Complexity

3/10.

## Goal

Omit the default-menu contribution after its plugin has been disabled.

## Approach

Resolve only declared or active host records, using statusFor without activating the plugin. Use the same resolution helper for offering and running the contribution, so an action offered before disablement cannot dispatch afterward. Preserve unknown-label and multiple-contributor refusal.

## Implementation steps

1. Add eligibility filtering in `src/controller/plugin-adapter.ts`. Add real-host lifecycle tests in `src/controller/plugin-adapter.test.ts` and a subsequent-menu clipboard regression in `web/src/context-menu/DefaultContextMenu.test.tsx`. Run `./scripts/run.mjs check-diff`.
2. Update `product/specs/context-menu.md`, promote the plan, remove this backlog entry, validate and push the existing PR.

## Tests

Declared records offer the action without loading. Active records remain eligible. A throwing handler disables its record, removes the contribution, and blocks an action offered before disablement from reaching the host dispatcher. Unknown labels and multiple eligible contributors dispatch nothing. A subsequent menu receiving no contribution keeps both clipboard actions usable.

## Out of scope

Plugin activation policy, new host API, other backlog entries, PR description, and merging. Help and public documentation do not describe this contribution, so no updates are needed. No new comments.
