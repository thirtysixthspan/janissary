# Give the SQL tab the control that starts a CSV or JSON export

**Complexity: 2/10** — one control group in the grid's action bar, the `export` intent that already
exists on both sides, and the two state rules the button needs. No server change, no new intent, no
wire change: `src/plugins/sql/intents.ts` already implements `export`, `foldExport` already folds the
answer into `payload.exports`, and the header already renders the finished file as a download link
through the authenticated `resourceUrl`. The whole feature is unreachable only because no control
asks for one.

## Goal

A `CSV` and a `JSON` control beside the grid's other actions, which send the `export` intent with the
format chosen and are unavailable whenever there is nothing to export or another request is already
outstanding. The finished file then appears in the header's export links exactly as the spec already
promises.

## Approach

The control belongs in the grid's action bar, next to the Copy and Columns controls, rather than in
the tab header:

- an export writes the whole filtered, ordered query of **the object the grid is showing**, which is
  the same thing the grid bar already names and the same bar that already carries what can be done
  to it — including the read-only state that does not stop an export, because a view can be read
  whether or not it can be written;
- it must be unavailable when no object is selected, and only the grid knows that; the header knows
  it only as `Loading…`;
- the header is the row that wraps in a docked sidebar, and it already carries the database
  switcher, the Schema/Data switch, two drawer toggles, the export links, and the host's split
  control.

Two text buttons rather than two icons: CSV and JSON are words, and two near-identical download
glyphs side by side would be a guess. They use the plugin's own `sql-export-actions` styling and the
same `disabled` treatment the other grid controls use.

Availability is one rule, stated in the control's own comment: the tab waits on one request at a
time, so an export asked for while a read is still in flight would be answered after it and replace
the page it was meant to describe. So both buttons are disabled while `payload.pending` is set, which
is the same condition the console already reports as busy, and while no object is selected.

## Implementation steps

1. `web/src/plugins/sql/DataGrid.tsx`: add the `CSV` / `JSON` pair to `sql-grid-actions`, sending
   `export` with `{ format }`, disabled when the payload is busy or names no object.
2. `web/src/plugins/sql/sql.css`: one rule for `.sql-export-actions` and its buttons, matching the
   existing `.sql-icon` disabled treatment.
3. `web/src/plugins/sql/SqlTab.test.tsx`: the tests below.
4. `product/specs/sql-database.md`: the Export section names the control, since it already promises
   the tab "offers it as a download" without saying how one is started.

## Tests

In `web/src/plugins/sql/SqlTab.test.tsx`, which renders the whole tab and so exercises the control in
its real place:

- pressing **CSV** sends `export` with `{ format: 'csv' }` and pressing **JSON** sends
  `{ format: 'json' }`, one intent each.
- both controls are disabled while a request is outstanding, and enabled again once it lands — the
  case the "one request at a time" rule exists for, and the one a test that only presses a button
  would miss.
- both controls are disabled for a payload naming no object, so an export cannot be asked for before
  the navigator has chosen one.
- the finished-file link still renders alongside them, so a control that issues an export and the
  header that offers the result are pinned as one flow.

No server test is added: `src/database/export.test.ts` already covers the writers, the numbered
filenames, the CSV quoting, and the row ceiling, and the intent's own test covers the wiring.

## Out of scope

- Moving the finished export links out of the header, which is where the spec's layout puts them.
- Any change to what an export contains. It stays the whole filtered, ordered query, not one page.
- The `MAX_EXPORTS` cap of what the header lists, and the three-column count in
  `sql-database-browser.md`'s Verification section, which is the branch's third backlog entry.
