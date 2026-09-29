<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle a database deleted by `db sqlite delete` while its browser tab is open, instead of letting the next refresh silently bring the file back.

Existing Issue: `runDatabaseCommand`'s delete arm in `src/database/index.ts` closes the connection and removes the file, and `DatabaseManager.forgetConn` drops the name from every tab's attribution, but nothing tells a `sql` tab that its database went away; the tab keeps the grid it last read, and its `Refresh` issues a schema read, which reaches `getConnection` and recreates the empty file. Severity: 5/10

Existing Risk: 5/10 - A user deletes a database they have finished with, presses Refresh in a tab they left open, and gets a new empty database back under the same name with no indication that anything was deleted.

Proposal Risk: 3/10 - Telling the tab is a cross-tab signal the plugin has to subscribe to, so a tab closed or never opened still has to behave, and a missed signal leaves the original staleness in place.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1467: tell an open browser tab when its database is deleted". Raise one more bus event from `deleteDatabase` in `src/database/index.ts` on a channel the database manager owns, and have `DatabaseManager` record the deletion in the browser state so `readView` reports the name as neither existing nor open. In `src/plugins/sql/fold.ts` and `src/plugins/sql/activate.ts`, drop the tab's grid when the database it names has stopped existing, and put `Database "<name>" does not exist.` in its error band, and make the tab's `Refresh` show that rather than issue a read that would recreate the file — which means the schema read must check existence before opening a connection, the same check `queryDatabase` already makes. Cover the signal in `src/plugins/topics.test.ts` if the deletion reuses a topic, or in `src/database/browser.test.ts` at the state layer, and add a case to `src/plugins/sql/activate.test.ts` that a tab whose database has gone reads the message and keeps no grid. `deleteDatabase`'s own return text and `db sqlite delete` behaviour are unchanged.


* Remove the dead `rowLabel` helper and the two unused exports the plugin module accumulated, and give the page-size list one owner instead of three.

Existing Issue: `rowLabel` in `web/src/plugins/sql/grid-view.ts` is exported and called by nothing, `databaseFromKey` in `src/plugins/sql/tabs.ts` is exported and called by nothing, and the page-size list `[50, 100, 500]` is written out three times — in `src/plugins/sql/tabs.ts`, in `src/plugins/sql/shared-intents.ts`, and in `web/src/plugins/sql/grid-view.ts` — so the guard that accepts a page size and the control that offers them are two independent copies that can drift. Severity: 3/10

Existing Risk: 3/10 - A page size added in one place is refused by the guard or missing from the control, and the dead exports invite a caller that quietly depends on a helper nothing renders.

Proposal Risk: 2/10 - The three copies become one, so a change now has a single place to land, which is the whole of the improvement.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1467: drop the sql plugin's dead exports and unify the page sizes". Delete `rowLabel` from `web/src/plugins/sql/grid-view.ts` and `databaseFromKey` from `src/plugins/sql/tabs.ts`, and drop the `PAGE_SIZES` copy from `src/plugins/sql/tabs.ts`, which nothing reads. Keep the one in `src/plugins/sql/shared-intents.ts` as the server's authority, because it is the guard, and have the client read its sizes from the tab payload instead of declaring its own — the payload's `limit` already carries the value in force, so add a `pageSizes` field to `SqlPayload` in `src/plugins/sql/shared.ts`, publish the server's list when a tab opens in `src/plugins/sql/open-tab.ts`, extend the payload guard for it, and render the options from it in `web/src/plugins/sql/Pager.tsx`. The `client` project's `@shared/plugins/...` alias already resolves the shared contract, so the client needs no new import of the server module. `web/src/plugins/sql/grid-view.test.ts` drops its `PAGE_SIZES` import and keeps every other case; `src/plugins/sql/shared.test.ts` gains a case that the payload guard accepts a well-formed `pageSizes` and rejects one holding a value the guard would refuse.


* Replace the two `browser`-named modules under `src/database/` with names that say which is the state and which is the service, so a reader can tell them apart without opening both.

Existing Issue: the diff adds `src/database/browser.ts` and `src/database/browser-service.ts`, and the second imports the first, so the pair is distinguishable only by the `-service` suffix and by which one exports the class; `src/database/index.ts` already uses `index.ts` for the command dispatcher, so the suffix convention is new to this tree rather than inherited. Severity: 3/10

Existing Risk: 3/10 - A later change reaches for the wrong one of the two, and the mistake is only visible at the point where a request id or a result list is expected.

Proposal Risk: 1/10 - A rename moves code without changing any of it.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1467: name the two browser modules for what they hold". Rename `src/database/browser.ts` to `src/database/browser-state.ts` and `src/database/browser-service.ts` to `src/database/browser.ts`, so the class's own module is the plainly named one and the state it owns carries the qualifier, matching how the tree already separates a manager from the modules it composes. Update the imports in `src/database/browser-service.ts` — which becomes `src/database/browser.ts` — in `src/database/manager.ts`, and in `src/database/browser.test.ts`, and move `databaseRefs` and `RESULT_LIMIT` to the file that now holds them. No behavior changes and no test changes beyond the import paths; `src/database/browser.test.ts`'s cases must all keep passing against the renamed modules, which is the check that the move was purely mechanical.


* Repair the mangled glyph and broken column alignment in the pull request description's behavior example, so the grid sketch renders as drawn.

Existing Issue: the ASCII grid in the description's Behavior examples section puts a replacement character where one row's delete control belongs — the first data row's cell holds two replacement characters while the second row's holds a single trash glyph — and the two cells are padded to different widths, so the table it sketches does not close on its own right edge. Severity: 2/10

Existing Risk: 2/10 - The sketch is the part of the description a reader uses to picture the layout, and a broken glyph reads as a rendering fault in the feature rather than in the text.

Proposal Risk: 1/10 - The text is only redrawn once and the feature itself is unaffected.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1467: fix the mangled glyph in the description's grid sketch". Edit the Behavior examples section of the pull request description so every row of the ASCII grid carries the same delete-control glyph and every cell in a column is padded to the same width, keeping the box drawing aligned. Change nothing else in the description: the prose, the verification steps, and the files-changed list all match the diff. Verify by reading the rendered description and confirming the grid closes on its right edge.
