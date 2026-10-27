# Document supported file-navigator command forms

Complexity: 2/10.

## Goal

The `files` help page lists the supported path, tab-target, sidebar-placement, and detail-mode forms with examples that match the command parser.

## Approach and implementation

1. Update `help/files.md` to include bare `left`/`right` placement, `in <label>` with or without a path, `on <side>` placement, and the four `with <mode>` values. Explain that the `in`, `on`, and `with` clauses can be combined in any order before a path, preserve path-before-`in` targeting, and give examples including a targeted navigator docked to a side.
2. Update `product/specs/file-navigator-tab.md` to record that `help files` lists the supported command forms and examples.
3. Verify the documented forms against the existing parser and manager tests, run `$janissary/scripts/run.mjs check-diff`, promote this plan, and remove only the resolved pull-request backlog entry.

## Tests

`src/file-navigator/args.test.ts` covers the detail modes, clause ordering, bare docking, and path targeting. `src/file-navigator/manager.test.ts` covers docking, `files in <label>`, both target-and-dock clause orders, and detail modes. No test asserts help-page wording, so compare the revised page directly with these source cases rather than adding a prose-pinning test. Run both existing test files and `check-diff`.

## Out of scope

Parser or manager behavior changes, new tests for static help wording, other command help pages, and the next pull-request backlog entry.
