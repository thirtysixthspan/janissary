# Sessions table alignment

Issue: the table headings and row entries on the sessions tab should be aligned. the action buttons on each row should be in their own column.

Complexity: 2/10

## Goal

Keep every sessions-table value under its heading, including joined rows, and reserve the final column for row actions.

## Approach

- Give headers and rows the same explicit six-column grid, with shrinkable text columns and a dedicated automatic-width actions column.
- Indent only the joined row's host content rather than shifting the whole grid, so joined rows remain aligned with the headings and action buttons.
- Add stylesheet assertions for the shared grid and joined-row indentation.

## Tests

- `web/src/plugins/sessions/sessions-style.test.ts` verifies the shared six-column grid and that joined rows preserve it.

## Out of scope

- Changing row data, actions, or selection behavior.

## Specs / docs

- `product/specs/sessions-tab.md` states the alignment and dedicated actions column. No public documentation currently describes this layout.
