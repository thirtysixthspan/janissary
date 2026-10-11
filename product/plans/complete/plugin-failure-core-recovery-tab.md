# Plugin Failure Core Recovery Tab

Complexity: 6/10

## Goal

When plugin failure removes the final central tab, leave the application with a usable core tab instead of triggering application exit.

## Approach

Before removing a plugin's tabs, check whether they own every central tab. If so, open or undock the existing notifications feed as the surviving central surface. Recompute plugin tab indices after opening it, then use the normal tab close path to release plugin resources and preserve focus.

## Implementation steps

1. Update `closePluginTabs` in `src/plugins/teardown.ts` to preserve the notifications feed when all central tabs belong to the failed plugin and to resolve owned indices after opening it.
2. Extend `src/plugins/teardown.test.ts` with cases for the failed launch shell, multiple failed central tabs, and an unrelated docked tab, checking no exit, complete resource release, and valid focus.
3. Preserve the existing launch refusal when the shell plugin fails before mounting a tab, covered by `src/launch-shell.test.ts`.
4. Update `product/specs/tab-plugins.md` and `documentation/user-documentation/command-bar/plugins.md` to describe the recovery surface after plugin failure.

## Tests

- Run `./scripts/run.mjs check-diff` after implementation and test changes.
- Retain `src/tab/close.test.ts` coverage for the user's intentional last-tab exit behavior.

## Out of scope

- Changing intentional last-tab close behavior.
- Changing plugin failure reporting or restart behavior.
- Updating public user documentation; the recovery surface is already part of the plugin failure behavior.
