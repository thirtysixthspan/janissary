<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Say a column with no values has too many to chart only when that is the reason.

Existing Issue: The statistics panel prints its too-many-to-chart line for any column with no bars, and a column holding nothing but nulls has no bars because it has no distinct values at all, so the panel states a figure directly above it that contradicts the line beneath. Severity: 3/10

Existing Risk: 3/10 - A user reading a column that is entirely null is told it holds too many values to chart, which sends them looking for a cardinality problem that does not exist and away from the null count printed in the same panel.

Proposal Risk: 1/10 - The line becomes conditional on the reason it exists, and a high-cardinality column still reads exactly as it does today.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1467: say a column with no values has too many to chart only when that is the reason". In `web/src/plugins/sql/StatsPanel.tsx`, render the too-many line only when the column has a distinct count above the server's `DISTINCT_LIMIT` and no values, and render the bars whenever there are values, so a column with no distinct values at all shows neither. `src/database/stats.ts` already returns an empty value list for a column with zero distinct values, so no server change is needed. Cover it in the new `web/src/plugins/sql/StatsPanel.test.tsx` named in the plan-fidelity entry on this branch, with a case for an all-null column asserting the too-many line is absent. `product/specs/sql-database.md` already constrains that line to a column with more distinct values than the threshold, so it needs no change.
