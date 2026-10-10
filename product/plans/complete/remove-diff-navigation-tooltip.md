# Remove the diff navigation hover tooltip

**Complexity: 1/10** — the tooltip is a single `title` attribute on the diff body; keyboard navigation has its own documented behavior.

## Goal

Stop the diff body's keyboard instructions from appearing as a hover tooltip.

## Approach

Remove the body's `title` attribute and assert that the body no longer exposes it.

## Implementation steps

1. Remove the diff-body tooltip and add a regression assertion.
2. Run the scoped checks.

## Tests

- `web/src/plugins/diff/DiffTab.test.tsx`: the diff body has no navigation title.
- `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Changing keyboard navigation or its spec description.
- Adding new user documentation.
