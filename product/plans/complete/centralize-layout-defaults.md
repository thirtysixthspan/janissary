# Centralize the default layout sizes

**Complexity: 2/10** — move three constants and retarget their local imports across four components and four tests. The numeric values and runtime behavior stay unchanged.

## Goal

Define the sidebar width, reporting height, and center split defaults in one import-free module. `useLayoutState` and the components that apply those defaults read directly from it, so the layout hook no longer imports view components.

## Approach

Add `web/src/layout-defaults.ts` with `DEFAULT_SIDEBAR_WIDTH_PX = 300`, `DEFAULT_REPORTING_PCT = 20`, and `DEFAULT_SPLIT_PCT = 50`. Update `useLayoutState`, `Sidebar`, `ReportingSection`, and `CenterActionArea` to import their values from that module, and remove the component exports. `CenterActionArea` uses the shared split default when its `splitPct` prop is omitted; its normal controlled callers continue passing the hook's value. Retarget the four existing tests without changing their assertions.

## Implementation steps

1. Add the focused layout-defaults module and change the four source files to import from it, using the split default as `CenterActionArea`'s omitted-prop fallback.
2. Retarget the four affected tests to import the constants from the new module.
3. Run `$janissary/scripts/run.mjs check-diff` after each implementation step.
4. Review `product/specs/sidebars.md`, `product/specs/tabs.md`, and `product/specs/profiles.md`, plus help and user documentation, for affected behavior. Clarify the existing 20% built-in reporting-height default in `product/specs/profiles.md`; public documentation does not need an edit because the behavior is unchanged.
5. Promote this plan to `product/plans/complete/` and remove only this item from the technical-debt backlog.

## Tests

No new test cases. Keep the existing assertions in `web/src/useLayoutState.test.tsx`, `web/src/Sidebar.test.tsx`, `web/src/ReportingSection.test.tsx`, and `web/src/CenterActionArea.test.tsx` passing after their imports are retargeted. The hook tests continue to cover default sizes sent on initial connection, reconnect, and manual resizing.

## Out of scope

- Changing any default value or layout behavior.
- Moving drag clamp values, which are local to their respective drag handlers.
- Changing app composition, help, or public documentation for behavior that remains unchanged.
