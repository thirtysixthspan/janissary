<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Keep the pager's unfiltered row count correct after a write, rather than reporting a filtered total larger than the unfiltered one.

Existing Issue: The unfiltered count an object is reported at is cached the first time it is read and reused for every later read of that object, so once a console or grid write changes the row count the pager's range line reports the count from before the write — `Rows 1–5 of 5 of 4 rows`, whose filtered total is larger than the unfiltered total it is divided against. Severity: 7/10

Existing Risk: 6/10 - The figure is the one the grid's own design calls its most important one, since a filtered view reporting the wrong denominator is indistinguishable from a table that really is that small, and the impossible `5 of 4` tells a reader the pager is broken rather than that the number is stale, so they stop trusting every count the tab shows after their first write.

Proposal Risk: 2/10 - The count is one statement more per read unless it stays cached, so the residual cost is a `SELECT COUNT(*)` on writes rather than on every page change.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1467: keep the pager's unfiltered row count correct after a write". Reproduce: open a database, select `customers` (four rows, no filters), then run `INSERT INTO customers (name) VALUES ('zoe')` in the console. Observed: the pager reads `Rows 1–4 of 4 rows` before the write and `Rows 1–5 of 5 of 4 rows` after, with five rows rendered; the second figure is the count cached before the insert. `DatabaseBrowser.query` in `src/database/browser.ts` seeds `this.unfiltered` from every read's `grid.unfilteredTotal` and `rememberedTotal` returns that entry before it looks at whether the query has filters, so the cached figure survives every later read; the map is cleared only in `dispose`. A write is what makes it wrong, so either drop the entry for the object on any `write` answer — `updateCell`, `insertRow`, `deleteRow` and `run` all record one — or stop serving the cache for a query with no filters and compute the unfiltered count from the query itself, which is what `totals` in `src/database/grid.ts` already does when handed `undefined`. Add a case to `src/database/browser.test.ts`: an object read with no filters, then written to, then re-read with no filters, reports the new count on both figures; keep the case that covers `rememberedTotal` seeding the cache for a first filtered query, since that is the reason the cache exists.


* Let Escape clear a selection that was started with the mouse, not only one made with the arrow keys.

Existing Issue: Escape leaves the grid's selection alone whenever no cell cursor is set, so a cell chosen by a click stays marked and a whole-row run built with `Shift`+arrow stays marked, while the same run clears once an arrow key has been pressed first. Severity: 5/10

Existing Risk: 4/10 - Escape reads as "clear what I marked" and silently does nothing for the ordinary way a selection is started, so a user pressing it to start again keeps editing the cell they thought they had deselected, and a row run they thought they had dropped still copies to the clipboard.

Proposal Risk: 1/10 - Escape would also stop clearing a cell cursor in the state it already handles, so nothing that works today changes.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1467: let Escape clear a selection started with the mouse". Reproduce on a three-row table: click any cell and press **Escape** — the cell stays marked; press `Shift`+`ArrowDown` twice and press **Escape** — all nine cells of the first two rows stay marked; press `ArrowDown`, then `Shift`+`ArrowDown`, then **Escape** — everything clears. Observed counts were 1 and 9 surviving against 0 in the third case. `product/specs/sql-database.md` says "`Escape` leaves the grid with nothing marked at all, whichever way it was marked", so the spec and the code disagree. `useGridKeys` in `web/src/plugins/sql/sql-keys.ts` handles Escape by returning early when `cursor` is null, so it never calls `onClear`, and `useGridSelection` in `web/src/plugins/sql/selection.tsx` holds the range a mouse run sets. Make Escape call `onClear` and reset the cursor whether or not a cursor exists, and only `preventDefault` when something was actually marked. Add cases to `web/src/plugins/sql/SqlTab.test.tsx` or a new `web/src/plugins/sql/sql-keys.test.tsx`: Escape with a click selection and no cursor clears it, Escape with a row run and no cursor clears it, and Escape with nothing marked still does nothing.


* Correct the spec's claim that the tab does not follow a foreign key, which the same spec describes in detail two sections earlier.

Existing Issue: `product/specs/sql-database.md` describes the foreign-key control in its filtering section — "Activating it selects that table filtered to the value" — and then lists "It does not join tables, follow a foreign key, or build a query." under "What it does not do", and `product/specs/database.md` still advertises the browsing surface as offering "per-column statistics, the SQL behind the current view", neither of which this branch builds. Severity: 4/10

Existing Risk: 3/10 - A spec is what a reader trusts when the description and the code disagree, so a contributor reading that the browser does not follow a foreign key will not find the working control, and one reading that it has a statistics panel will look for a panel that was deliberately removed.

Proposal Risk: 1/10 - Prose only, so the only thing that can go wrong is a sentence describing behaviour the next change alters again.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1467: correct the spec's claim that the tab does not follow a foreign key". In `product/specs/sql-database.md`, remove the foreign-key clause from the "What it does not do" list, keeping the joins and query-builder parts of that sentence, and add a clause naming foreign-key following as something the tab does, so the two sections agree. In `product/specs/database.md`, drop "per-column statistics, the SQL behind the current view" from the browsing-surface sentence, which `product/specs/sql-database.md` already contradicts with "There is no statistics panel" and "It does not show the statement behind the grid". No code or test changes; the behaviour was observed working in the pull request's own fifth testing step, where the key cell is titled `orders.id` and selecting it shows the referenced table filtered to that value.


* Correct the pull request's second testing step, which cannot be completed without a **Refresh** it does not name.

Existing Issue: The description's second **How to verify** step ends its first sentence with pressing **Refresh**, but its next sentence — adding a `CREATE VIEW`, a `CREATE INDEX` and a `CREATE TRIGGER` through the console and confirming each appears under its own group — does not, and the navigator still reads only `Tables` until **Refresh** is pressed. Severity: 3/10

Existing Risk: 3/10 - The step is how a reader checks that views, indexes and triggers are discoverable at all, so following it exactly reports the pull request as missing two of the three object kinds when all three are present.

Proposal Risk: 1/10 - One clause of prose, and the behaviour it describes is deliberate and already specified.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1467: correct the second testing step's missing Refresh". Observed: on a database seeded with `orders`, run `CREATE VIEW paid AS SELECT id, customer, total FROM orders WHERE status = 'paid'`, `CREATE INDEX orders_status ON orders(status)` and `CREATE TRIGGER orders_touch AFTER UPDATE ON orders BEGIN SELECT NEW.id; END;` in the console, in that order. The table dropdown then reads only `Tables`. Press **Refresh** and it reads `Tables,Views,Indexes,Triggers`, with `paid` under Views, `orders_status` under Indexes, and `orders_touch` under Triggers as an option that cannot be chosen. `product/specs/sql-database.md` states "the schema is re-read only when a `Refresh` is pressed", so the app is right and the step is what is wrong. Read the current description body with `gh pr view 1467 --json body`, and in that second bullet's second sentence put **Refresh** in the same way the first sentence does — "and a **Refresh**, then confirm each appears under its own group" — leaving every other paragraph exactly as the author wrote it and the title untouched. Apply it with `gh pr edit 1467 --body-file` after the commit is pushed, never before.
