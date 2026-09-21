# Hide sessions headings when no sessions exist

**Complexity: 2/10** — a client-only conditional around existing static table headings, with a focused rendering test and sessions spec update.

## Goal

Show only the empty-state message when the sessions list has no rows, without irrelevant column headings.

## Approach

`SessionList` already derives its empty state from `payload.entries.length`. Render `session-columns` only when that length is nonzero, leaving the existing row layout untouched. Adjust the current headings test to cover a populated list and add an empty-list assertion.

## Implementation steps

1. Render the sessions column heading block only when entries exist.
2. Update sessions list tests for populated and empty lists.

## Tests

- `web/src/plugins/sessions/SessionList.test.tsx` — verifies headings are present with rows and absent in the empty state.

## Spec updates

- `product/specs/sessions-tab.md` — state that empty sessions lists omit table headings.

## Docs

- Checked `help.md` and `documentation/user-documentation/`; neither describes this empty-state layout, so no update is needed.

## Out of scope

- Empty-state wording and all non-empty list layout.
