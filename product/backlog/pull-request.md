<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Add the test files and cases the plan listed and the diff does not contain.

Existing Issue: The plan's test section names a statistics-panel test file, a topic-union case asserting the databases topic is in the keyed record, and three manager cases for the new delegation, and none of the three appears anywhere in the diff. Severity: 4/10

Existing Risk: 4/10 - The statistics panel, the keyed topic record, and the manager's new methods ship untested, so a later change to any of them is unconstrained — and the plan sitting in `complete/` claiming coverage that does not exist makes the next reader believe those areas are held in place.

Proposal Risk: 1/10 - Adding the missing coverage constrains future edits without changing what the feature does, which is the whole of the change.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1467: add the test files and cases the plan listed and the diff does not contain". Add `web/src/plugins/sql/StatsPanel.test.tsx` covering the three things the plan named: a column of twenty or fewer distinct values rendering one bar per value scaled to the largest, a column of more rendering its distinct count and no bars, a numeric column rendering its minimum and maximum, and a null count of zero rendering no null row — mirror the style of `web/src/plugins/sql/SqlDrawer.test.tsx`, and drive it through `SqlTab` with the drawer open as `SqlTab.test.tsx` does for the rest of the panel. Add `src/plugins/api-topics.test.ts` if it does not already exist, asserting `isTabPluginNotificationTopic('databases')` is true and that the exported `TAB_PLUGIN_NOTIFICATION_TOPICS` carries it, so the keyed record cannot drift from the union as the comment on that record says it is there to prevent. Extend `src/database/manager.test.ts` with the three cases the plan listed: `listFiles()` returning the databases on disk, a browser `create` landing the database in the same registry `db sqlite create` does, and `readView()` answering the topic's read. Every existing case in that file keeps passing unchanged, which is the point it is there to prove.

* Correct the specification's claim about which database a bare command opens.

Existing Issue: The specification says a bare `sql` opens or focuses the tab for the most recently used database, and the implementation picks the first open entry in the registry's alphabetical list, which is a different choice as soon as a second database is open. Severity: 4/10

Existing Risk: 4/10 - With two databases open, the command lands on whichever sorts first rather than the one the user was last looking at, and the specification's sentence is the only place a reader would learn that, so the behaviour looks like a bug to everyone it surprises.

Proposal Risk: 2/10 - Whichever way it is settled, the sentence and the code finally agree; the unresolved half is what "most recently used" means for a registry that does not currently record the order, and that half stays a decision rather than a mismatch.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1467: correct the specification's claim about which database a bare command opens". Decide which of the two is right, then make the other match: either record open order in the browser slice and have `runCommand` in `src/plugins/sql/activate.ts` take the most recently opened name, or change the sentence in `product/specs/sql-database.md` and the `sql` command paragraph of `product/plans/complete/sql-database-browser.md` to say the first open database in name order. The topic's data slice is the natural place for an ordering, so if you take the first route add it to `DatabasesView` in `src/protocol/database.ts` and populate it in `databaseRefs` in `src/database/browser-state.ts`, then pin both with a case in `src/plugins/sql/activate.test.ts` covering two open databases in the reverse of alphabetical order. Whichever way it goes, `src/database/browser-state.ts` and `src/protocol/database.ts` must not both carry a field nothing reads.

* Say a column with no values has too many to chart only when that is the reason.

Existing Issue: The statistics panel prints its too-many-to-chart line for any column with no bars, and a column holding nothing but nulls has no bars because it has no distinct values at all, so the panel states a figure directly above it that contradicts the line beneath. Severity: 3/10

Existing Risk: 3/10 - A user reading a column that is entirely null is told it holds too many values to chart, which sends them looking for a cardinality problem that does not exist and away from the null count printed in the same panel.

Proposal Risk: 1/10 - The line becomes conditional on the reason it exists, and a high-cardinality column still reads exactly as it does today.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1467: say a column with no values has too many to chart only when that is the reason". In `web/src/plugins/sql/StatsPanel.tsx`, render the too-many line only when the column has a distinct count above the server's `DISTINCT_LIMIT` and no values, and render the bars whenever there are values, so a column with no distinct values at all shows neither. `src/database/stats.ts` already returns an empty value list for a column with zero distinct values, so no server change is needed. Cover it in the new `web/src/plugins/sql/StatsPanel.test.tsx` named in the plan-fidelity entry on this branch, with a case for an all-null column asserting the too-many line is absent. `product/specs/sql-database.md` already constrains that line to a column with more distinct values than the threshold, so it needs no change.
