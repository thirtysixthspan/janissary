# PR 1729: persist cleared runscript selection after catalog refresh

**Complexity: 3/10** — commit the already-derived reconciliation result to the dialog and module-level remembered fields, then pin refresh and reopen behavior in one focused interaction test.

## Goal

When a catalog refresh removes the selected runscript, that cleared choice remains cleared even if the same script later reappears or the dialog is reopened. Other form values, including the tab command draft, remain intact.

## Approach

Keep the existing field reconciliation as the source of the visible form state. When reconciliation changes the selected script, synchronize the reconciled fields to component state and module-level memory. Guard the synchronization by comparing the selected script so it does not overwrite unrelated form state or repeatedly update on render.

## Implementation steps

1. Synchronize a catalog-cleared script selection into component state and remembered fields.
2. Extend the dialog interaction test to remove and re-add a selected script, assert selection remains blank and system submission disabled, then close and reopen to verify the cleared choice persists.
3. Update `product/specs/scheduling.md` to state that a removed selection stays cleared after later catalog refreshes and dialog reopens.
4. Run `./scripts/run.mjs check-diff`, promote the plan, remove only the selected backlog entry, and publish to the existing PR branch.

## Tests

- Removing the selected runscript in a refreshed catalog clears the picker and disables Schedule; reintroducing it does not select it automatically.
- Closing and reopening after removal keeps the runscript selection blank.
- Selecting an available script remains the user's action that permits submission.

## Out of scope

- Resetting or changing other dialog fields during catalog refresh.
- Changes to runscript catalog generation, scheduling commands, or user documentation.
- PR description edits, merging, closing, or publishing to another branch.
