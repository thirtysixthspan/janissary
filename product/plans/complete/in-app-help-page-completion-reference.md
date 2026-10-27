# Document help-page completion in the in-app Tab reference

**Complexity: 1/10** — a focused update to one existing help page; completion behavior and its tests already exist.

## Goal

Make the in-app Tab reference accurately describe completion of the first argument after `help`, including the available page names and the no-candidates result for unmatched prefixes.

## Approach

Update the command-bar `Tab` row and the closing completion paragraph in `help/keys.md`. Match the behavior already stated in `product/specs/tab-completion.md` and `documentation/user-documentation/command-bar/tab-completion.md`.

## Implementation steps

1. Add the `help` first-argument completion context to the command-bar `Tab` row, naming help-page candidates, `commands` and `keys`, and the result for an unmatched prefix.
2. Add the same behavior to the closing Tab-completion paragraph in `help/keys.md`.

## Tests

No new tests are needed for this documentation-only correction. Existing cases in `src/completion/handlers.test.ts` and `src/completion/index.test.ts` cover successful help-page completion and no candidates for unmatched prefixes. Run `$janissary/scripts/run.mjs check-diff` to verify the branch.

## Out of scope

- Changing completion behavior or its tests.
- Updating the spec or user guide, which already describe this behavior accurately.
- Adding a wording-only assertion.
