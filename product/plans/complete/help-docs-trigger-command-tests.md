# Run command-help tests for help documentation changes

**Complexity: 3/10** — add one diff-scope rule, a small unit-testable scope helper, and document the test mapping.

## Goal

When Markdown files under `help/` change, the diff-scoped check runs `src/commands.test.ts`, which validates command help descriptions and page coverage.

## Approach

Add a small pure helper for recognizing Markdown files under `help/` and cover its path matching in a colocated script test. Add a help-documentation test job that runs the existing command test directly, independent of Vitest's `--changed` dependency tracking.

## Implementation steps

1. Add and test a helper that identifies Markdown files under `help/`.
2. Update `scripts/check-diff.mjs` to use the helper and run `src/commands.test.ts` when help Markdown changed.
3. Document the help-to-command-test mapping in `product/specs/testing.md`.
4. Run `$janissary/scripts/run.mjs check-diff` and verify the targeted command-help test.

## Tests

The helper test verifies help Markdown triggers help tests and unrelated Markdown does not, while existing source/web/script routing remains intact. `src/commands.test.ts` provides the end-to-end checks for help page content and command-row constraints.

## Out of scope

- Changing the test selection for unrelated documentation.
- Running full test suites for Markdown-only changes outside `help/`.
