# Connections list short column headings

Issue: remove the word 'connection' from the connections table headers.

Complexity rating: 1/10

## Goal

The connections list's heading row reads Host, Tab, Connection ID, Connection Name, Connection State, Last activity, and an unlabeled actions column. Every row in the list is a connection, so the prefix repeats what the tab's own title already says. Drop it so the headings read Host, Tab, ID, Name, State, Last activity.

## Approach

The headings are three literal spans in the `connections-columns` row of `web/src/plugins/connections/ConnectionList.tsx`. Change their text to `ID`, `Name`, and `State`. The class names (`connections-columns-id`, `-title`, `-status`) and the grid stay as they are, so layout and styling don't move.

Two comments name the old headings: the grid comment in `web/src/plugins/connections/connections.css` and the cell comment in `web/src/plugins/connections/ConnectionRowBody.tsx`. Update both so they don't describe text the list no longer shows.

The entry names the table headers only. The connection tab's metadata bar labels its fields (and their tooltips) `Connection ID`, `Connection Name`, and `Connection State` too, but it's a separate surface with no heading row, and its tooltips name a bare value such as a UUID where the longer label still earns its place. It keeps its labels.

## Implementation steps

1. In `ConnectionList.tsx`, change the three heading spans to `ID`, `Name`, and `State`.
2. In `connections.css` and `ConnectionRowBody.tsx`, update the comments that list the column names.
3. Update the heading-order test in `ConnectionList.test.tsx`.

## Tests

- `web/src/plugins/connections/ConnectionList.test.tsx`: the heading row reads exactly Host, Tab, ID, Name, State, Last activity, and the empty actions heading, and no heading contains the word "Connection".

## Out of scope

- The connection tab's metadata bar labels and tooltips.
- Row content, tooltips, accessible labels, the docked rendering, and the grid layout.
- The remaining pull-request backlog entries (per-connection last activity timestamps, a unique uuid for every connection).

## Specs and docs

- `product/specs/connections-tab.md`: the heading row and the list's column references use ID, Name, and State; the metadata bar paragraph keeps its own labels.
- `documentation/user-documentation/command-bar/connections.md`: the column list and the column descriptions use **ID**, **Name**, and **State**.
