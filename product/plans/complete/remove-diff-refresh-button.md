# Remove the diff tab's manual refresh button

**Complexity: 2/10** — remove the metadata control and its direct-refresh hook API while preserving the existing periodic refresh.

## Goal

Remove the Refresh button from the diff tab metadata bar while keeping the diff live through its existing one-second refresh interval.

## Approach

Make `useDiffRefresh` own only the interval, remove the button and its styles, and keep a test that checks the button is absent and periodic refresh still occurs. Update the diff-tab spec to describe automatic refresh without a manual control.

## Implementation steps

1. Remove the button, direct-refresh API, and button-specific styles and style test.
2. Update the diff tab test to verify the button is absent while periodic refresh remains active.
3. Update the diff-tab spec and run scoped checks.

## Tests

- `web/src/plugins/diff/DiffTab.test.tsx`: no Refresh button is rendered; the one-second refresh still runs.
- `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Changing the refresh interval or refresh intent behavior.
- Updating help or user documentation, which do not describe this control.
