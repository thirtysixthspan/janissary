# Tab manager runtime and modularity

**Complexity: 9/10** — this combines a per-tab runtime-state migration with extraction of split
selection and operation logic from a high-churn manager.

## Goal

Make tab runtime state owned by each tab and keep `TabManager` within the project’s 200-line rule,
with split-pane selection and tab operations in cohesive modules.

## Implementation

- Added `TabRuntime` to `Tab`, initialized by tab creation and rehydration, replacing the manager’s
  parallel cwd/busy/context/queue maps and adapting queue, transcript, view, and agent-state code.
- Extracted split selection, open-result transitions, tab operations, runtime operations, transcript
  operations, view/rehydration, and root-tab creation into focused modules.
- Removed the `max-lines` suppression from `TabManager` and retained compatibility for cleanup and
  transcript helper call sites covered by existing tests.

## Verification

`npm run typecheck:diff`, `npm run lint:diff`, and `./scripts/run.mjs check-diff` pass.
