# Connections list name and id columns

Issue: connection name in the table should be 'acp:<tab name>'. Include connection id in a column before connection name.

Complexity rating: 3/10

## Goal

The connections list's Connection Name column shows a tracked record's own title (`ACP: <first line of its first prompt>` or `Agent: <task filename>`), while the record's connection tab is already titled `<kind>:<owning tab name>`. Name record rows the same way the tab is titled, so an ACP record reads `acp:<tab name>` in the list, and an agent run reads `agent:<tab name>`. Live rows already use the `kind:name` form (`sqlite:<name>`, `shell:<cwd>`, `acp:<agent name>`) and keep their display text.

Several records owned by one tab now share a name, so add a Connection ID column immediately before Connection Name. It shows the row's id: a record's UUID, or a live connection's id as `connections close <kind>:<id>` accepts it.

## Approach

The `<kind>:<owner name>` form is currently built on the server only, by `recordTabTitle` in `src/plugins/connections/record-tabs.ts`. The client list needs the same string, so move the helper into the import-free shared contract `src/plugins/connections/shared.ts` as `recordConnectionName(row)` and have both the server tab factories and the client list import it from there. One definition keeps the tab title and the row name from drifting.

In `web/src/plugins/connections/ConnectionList.tsx`, a new `connectionName(row)` returns the live row's `display` or `recordConnectionName(row)` for a record. That name fills the Connection Name cell in both the table and the docked rendering. The record's own title is kept where it disambiguates and where a reader already expects it:

- The row tooltip reads the name, then the record's own title for a record row, then the kind. A live row's tooltip stays `name` then kind.
- The Close and Delete accessible labels and the `Delete "<title>"?` confirmation keep the record's own title, since two closed records from one tab would otherwise read identically.

`web/src/plugins/connections/ConnectionRowBody.tsx` gains a `connections-row-id` cell between Tab and Connection Name in the wide row, and receives the display name and the action label separately. The docked rendering adds no id field: the entry asks for a table column, and the docked list has no columns.

`web/src/plugins/connections/connections.css` adds a seventh grid track for the id, `minmax(0, 1fr)`, ellipsized and muted like the Host and Tab cells. The heading row gains `Connection ID`.

## Implementation steps

1. Move `recordTabTitle` from `src/plugins/connections/record-tabs.ts` into `src/plugins/connections/shared.ts` as `recordConnectionName`, and update `record-tabs.ts` to import it.
2. In `ConnectionList.tsx`, add `connectionName(row)`, pass the name and the action label to the row body, add the `Connection ID` heading before `Connection Name`, and extend the row tooltip with the record title for record rows.
3. In `ConnectionRowBody.tsx`, take `name` and `label` separately, render the id cell in the wide row, use `name` for the title cells and `label` for the actions.
4. In `connections.css`, add the id track to the shared grid and the id cell to the ellipsized and muted rules.
5. Update existing tests that pin the old record row text, heading order, and wide-row cells.

## Tests

- `src/plugins/connections/shared.test.ts`: `recordConnectionName` returns `acp:<owner name>` for an ACP record and `agent:<owner name>` for an agent run.
- `web/src/plugins/connections/ConnectionList.test.tsx`:
  - The heading row reads Host, Tab, Connection ID, Connection Name, Connection State, Last activity, and the actions column.
  - Mixed rows render record names as `<kind>:<owner name>` and live names as their display.
  - The wide row's cells run host, owner, id, title, status, activity, actions, and the id cell shows the row id for live and record rows.
  - A record row's tooltip reads the name, the record title, then the kind; the Delete control and confirmation still name the record title.
  - Docked, a record row's first line reads `<kind>:<owner name>` and the row has no id field.
- `web/src/plugins/connections/connections-style.test.ts`: the id cell is ellipsized and muted with the host and owner cells, and the shared grid has seven tracks.

## Out of scope

- Live row display text, including monitor and editor-persona ACP rows, the shell and SQLite rows, and the connections popup.
- Record titles themselves, the connection tab's metadata row, and `connections <title>` lookup.
- The remaining pull-request backlog entries (system shell row not closable, ACP command echo in the shell, connection tab metadata bar).

## Specs and docs

- `product/specs/connections-tab.md`: the heading row gains Connection ID before Connection Name; a record row's Connection Name is `<kind>:<owning tab name>` and its tooltip carries the record's own title; accessible labels and the Delete confirmation keep the record title.
- `documentation/user-documentation/command-bar/connections.md`: the column list gains **Connection ID**, and the Connection Name wording for records.
