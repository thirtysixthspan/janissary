# Organize the sessions table host, type, tab name, state, time, actions — with column names

## Complexity

3/10 — a column reorder plus a header row in one component, its stylesheet, its tests, and its spec.

## Goal

The entry: "the conversations table should be organized host, type, tab name, state, time, actions. provide column names in the table." "The conversations table" here is the sessions list — the reviewer's shorthand for the list modelled on the conversation list. Two asks:

1. Column order host, type, tab name, state, time, actions (currently host, tab name, type, state, time, actions).
2. A header row naming the columns.

## Approach

- `SessionList.tsx`: render a header row (`.session-columns`, role="presentation", outside the rows so it never interrupts keyboard caret or `data-index` addressing) with the labels Host, Type, Tab, State, Last activity and a blank actions cell; reorder each row to host, kind, name, state, activity, actions.
- `sessions.css`: give `.session-columns` the row grid template so labels line up with columns.
- Update `SessionList.test.tsx`: swap the kind/name order assertions, and assert the header's labels and alignment.

## Tests

- Updated: "renders the five columns in the host-provided order" (column reorder).
- New: header row carries a label per column and the actions column stays unlabeled.
- Navigation and click tests are unaffected — no row is added to `.session-rows`.

## Out of scope

- Other backlog entries; the conversations list itself (unchanged).
