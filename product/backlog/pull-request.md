<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Make the stored-chart guard hold the same four fields the grammar does, so a record cannot carry a unit or a stack the renderer would read differently.

Existing Issue: `isChart` in `src/visualizations/chart-record.ts` checks `kind` and `aggregate` as bare strings and does not mention `percentile`, `xUnit`, `stack` or `metric`, while the grammar in `src/visualizations/chart-spec.ts` is strict about all four, and the header comment there claims one grammar stated in three places. Severity: 6/10

Existing Risk: 6/10 - A record read back from disk, or hand-edited, with `xUnit: 'fortnight'` passes the guard and reaches `startOf`'s `default` branch, which floors every row to the first of January — a chart that draws successfully and means something else. The same drift made four aggregates blank the tab this cycle.

Proposal Risk: 2/10 - Tightening a guard can refuse a record that was readable, which loses a visualization, so the new checks have to be exactly the grammar's.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1440: hold the stored-chart guard to the grammar's four optional fields". In `src/visualizations/chart-record.ts`, validate `percentile`, `xUnit`, `stack` and `metric` the way `optionalShapeOf` in `src/visualizations/chart-spec.ts` does, reusing that code rather than restating it, so the third copy cannot drift from the second. Verify with cases in `src/visualizations/store.test.ts` for a record carrying each field wrongly and refusing to be read back, and a case carrying each rightly and reading back.
