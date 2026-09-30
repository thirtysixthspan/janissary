# Report a statement's result as a notification, not a line in the tab

**Complexity: 6/10** — the host has to render a statement's result and file it when it is too long to
sit in a notification, the plugin capability grows a link, and the payload loses the log the tab line
was reading. Every piece has a precedent in this codebase, so nothing here is new architecture; it
does reach across the host, the plugin contract, and three specs.

## Goal

The line under the SQL prompt reports what the last statement did. It is the first thing the next
keystroke replaces and the first thing lost when the user looks at another tab, so a result the user
asked for is reported somewhere they will still find it.

The result becomes a notification. A short one is the whole result. A long one is a shortened result
on the line, with a link to a file holding all of it — the same shape as an auto-approved permission
prompt's screen capture, which is the existing answer to "this is too long for a line".

With nothing in the tab reading it, the tab's statement log goes too.

## Approach

**The host renders, and files.** A plugin may not write files and may not format rows —
`formatRows` in `src/database/query.ts` is behind the plugin import boundary — so both belong in
`src/database/console-read.ts`, beside the read that already streams the rows.

One pass, and no statement run twice. `readStatement` walks the iterator once, keeping the first 200
rows for the grid and buffering the first 40 lines of the rendered result. If row 41 arrives, the
result is long: the buffer is flushed to a file the row stream then continues into, and the same
`EXPORT_ROW_LIMIT` that bounds an export bounds it. A result of forty lines or fewer never touches
the disk at all. The rendering is tab-separated, because it has to be written a line at a time and
because a spreadsheet and an editor tab both read that.

**The report rides on the answer, not on the grid.** `DatabaseResultView`'s `query` kind gains an
optional `report: { text, file? }`. The grid is what the client draws and is unchanged; the report is
what the notification says and never reaches the payload.

**The capability grows a link, nothing else.** `notifyUser(text, options?)` with
`{ openFile }`, passed straight through to the `openFile` the notifications feed has carried since an
auto-approval. The event type, the originating tab, and everything else about the grant stay as they
are, and no manifest changes: the capability is already declared and the gate is by name. It is
additive, so the API version does not move.

**The plugin reports two things, told apart by what it already knows.** A `run` that returned rows
carries a report on its answer; a `run` that did not is a write, and its outcome is the sentence the
tab line was showing. A write the grid made itself is neither, and a statement that failed is already
reported as a failure.

**The log goes.** After this, nothing reads `payload.log`: the history panel is gone and so is the
line. A fifty-entry list broadcast on every update for no reader is the state the repo treats as a
defect, so `SqlConsoleResult`, `MAX_LOG`, `addToLog`, the payload field and its guard all go with it.

## Implementation steps

1. **`src/database/console-read.ts`** — render the result as it streams; write the whole of it to
   `.janissary/db/exports/<database>-result-<timestamp>.txt` once it is over the inline budget;
   return `{ grid, report }`.
2. **`src/database/export.ts`** — the writer and its timestamped name, beside the export writer it
   shares a directory and a limit with.
3. **`src/database/browser.ts`** — `run` passes the database name through and records the report.
4. **`src/protocol/database.ts`** — `DatabaseStatementReport`, and the `report` field on the `query`
   answer.
5. **`src/plugins/api.ts`**, **`src/plugins/context.ts`** — `notifyUser(text, options?)`.
6. **`src/plugins/sql/activate.ts`** — report a console statement's outcome, once, wherever it landed.
7. **`src/plugins/sql/fold.ts`**, **`src/plugins/sql/tabs.ts`**, **`src/plugins/sql/shared.ts`** —
   the log and everything that fed it.
8. **`web/src/plugins/sql/SqlTab.tsx`**, **`console-result.ts`**, **`sql.css`** — the line, the
   sentence builder, the rule.

## Tests

- `src/database/console-read.test.ts` — a short result is the whole result with no file; a long one is
  shortened inline, names the real count, and points at a file holding every row; the cap is reported
  rather than passed over; a read that returns nothing says so; a write never produces a report.
- `src/database/export.test.ts` — the result file is named for its database and a timestamp, lands in
  the export directory, and holds the whole result.
- `src/plugins/sql/activate.test.ts` — a statement that changed rows says so once; a statement that
  returned rows says the result, with the link when there is a file; a statement that failed is not
  also reported as a success; a grid write says nothing. The log cases go.
- `src/plugins/sql/shared.test.ts` — the log guard cases go.
- `web/src/plugins/sql/SqlTab.test.tsx` — the line is gone; a grid write, a cell edit and a filter
  still say nothing.
- `web/src/plugins/sql/sql-style.test.ts` — `.sql-console-result` joins the removed selectors.

## Specs

- `product/specs/sql-database.md` — the console's result is a notification, short inline and long as a
  shortened line plus a link, and the tab no longer keeps a log of statements.
- `product/specs/notifications.md` — a `plugin-note` may carry one file link, and its message is
  bounded.
- `product/specs/tab-plugins.md` — the `notifyUser` grant grows the link and only the link.

## Out of scope

- The failure notification, which already exists and does not change.
- A read's own range line, which still says the grid was cut off at two hundred rows.
- `TabPluginResources.registerFile` and the `/open/` allow-list. A notification link is an absolute
  path opened through `edit`, which is what the auto-approval's capture does; registering would add a
  per-tab reference for a file that outlives the notification.
- Toasts, which render no links at all today whatever the event.
