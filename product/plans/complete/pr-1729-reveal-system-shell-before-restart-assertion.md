# PR 1729: reveal system shell before restart output assertion

**Complexity: 2/10** — focus the managed system shell before asserting its visible output and quote the seeded `printf` format so zsh emits the expected marker.

## Goal

Make the ordinary-restart E2E scenario observe the retained runscript's output reliably when the system shell starts hidden.

## Approach

Keep the persisted schedule checks, the runscript existence check, execution command, visible-shell locator, marker wait, and store-retention assertion. Focus the `system` tab after execution so the managed shell is visible when the output assertion runs. Quote the runscript's `printf` format so zsh preserves its `\n` escape instead of printing a trailing `n`.

## Implementation steps

1. Add `tab focus system` between `execute restart-probe` and the visible system-shell locator in `scripts/e2e/system-schedules-restart.mjs`, and quote the seed's `printf` format to produce the exact marker.
2. Keep the existing scheduling behavior specification unchanged because it already states that the retained runscript can execute in the managed shell after relaunch.
3. Promote this plan, remove the resolved backlog entry while restoring the empty PR-backlog skeleton, run diff checks and the restart E2E in two attached-browser batches, then commit and push to the existing PR branch.

## Tests

- Run `./scripts/run.mjs check-diff` after each change and once after all changes.
- Run the ordinary-restart system-schedules E2E across its seed and post-restart phases using two separate browser batches.

## Out of scope

- Changes to schedule persistence, shell startup, or runscript execution behavior.
- Changes to other system-schedule scenarios or user documentation.
- PR description edits, merging, closing, or publishing to another branch.
