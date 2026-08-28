# Colocate picker overlays

## Goal

Move the picker-overlay capability out of the flat web root into `web/src/pickers/` while preserving behavior and the enforced rule that sibling features do not import one another.

## Implementation

1. Move the picker components, picker state hooks, keyboard helpers, shared overlay props, and their colocated tests into `web/src/pickers/`. Update their imports of app-shell and shared root modules.
2. Have root app-shell components compose picker elements and pass opaque rendered content into `agent-tabs` and `harness`, removing their direct picker imports.
3. Add `pickers` to the ESLint feature-boundary matrix and extend its integration coverage so future picker-to-feature or feature-to-picker imports fail lint.
4. Run the differential validation suite, remove the exact technical-debt entry, and complete this plan.

## Verification

- Existing picker component, hook, and keyboard tests continue to pass from their new locations.
- `src/eslint-feature-boundaries.test.ts` proves the new feature participates in sibling isolation.
- `./scripts/run.mjs check-diff` passes.

## Documentation and specification impact

None. This is a behavior-preserving source-layout refactor with executable architecture enforcement.
