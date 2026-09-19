# Label the sessions tab 'sessions'

## Complexity

1/10 — a one-word title change plus its test and spec line.

## Goal

The tab's title reads `Sessions`; the entry asks for lowercase `sessions`, matching the command (`sessions`) and the manifest's `tabLabelPrefix`.

## Approach

Change `TAB_TITLE` in `src/plugins/sessions/activate.ts` to `sessions`, update the activate test's assertion, and update `product/specs/sessions-tab.md`'s title line. No other spot titles the tab.

## Tests

Update `activate.test.ts`: the test "opens the singleton list titled Sessions…" asserts `title` `'Sessions'` — change it to `'sessions'`.

## Out of scope

- Other backlog entries.
