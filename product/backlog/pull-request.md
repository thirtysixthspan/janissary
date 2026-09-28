<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Keep the measures the user named when a reply brings twelve of its own.

Existing Issue: `remembered` in `src/visualizations/metrics.ts` trims the combined list with `.slice(-MAX_METRICS)`, which evicts the oldest entries — including measures the user introduced — when a reply defines enough of its own, and nothing says so. Severity: 5/10

Existing Risk: 5/10 - The model can empty a user's named measures in one turn, `metricList` then stops offering them in the prompt, and every chart naming one is refused from then on, with nothing anywhere saying the measure the user asked for is gone.

Proposal Risk: 3/10 - Preferring the user's measures over the model's is a judgement about whose words outrank whose, and a reply that corrects a measure the user named must still win.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1440: do not let a reply's measures evict the user's". In `remembered` in `src/visualizations/metrics.ts`, drop the oldest of the *incoming* definitions when the combined list is over the bound rather than the oldest overall, and say in the turn's response when a definition was refused for want of room. Verify with a case in `src/visualizations/metrics.test.ts` folding twelve definitions onto a record holding a user measure and asserting the user measure survives, and a case asserting the oldest incoming one is dropped instead.

* Make the stored-chart guard hold the same four fields the grammar does, so a record cannot carry a unit or a stack the renderer would read differently.

Existing Issue: `isChart` in `src/visualizations/chart-record.ts` checks `kind` and `aggregate` as bare strings and does not mention `percentile`, `xUnit`, `stack` or `metric`, while the grammar in `src/visualizations/chart-spec.ts` is strict about all four, and the header comment there claims one grammar stated in three places. Severity: 6/10

Existing Risk: 6/10 - A record read back from disk, or hand-edited, with `xUnit: 'fortnight'` passes the guard and reaches `startOf`'s `default` branch, which floors every row to the first of January — a chart that draws successfully and means something else. The same drift made four aggregates blank the tab this cycle.

Proposal Risk: 2/10 - Tightening a guard can refuse a record that was readable, which loses a visualization, so the new checks have to be exactly the grammar's.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1440: hold the stored-chart guard to the grammar's four optional fields". In `src/visualizations/chart-record.ts`, validate `percentile`, `xUnit`, `stack` and `metric` the way `optionalShapeOf` in `src/visualizations/chart-spec.ts` does, reusing that code rather than restating it, so the third copy cannot drift from the second. Verify with cases in `src/visualizations/store.test.ts` for a record carrying each field wrongly and refusing to be read back, and a case carrying each rightly and reading back.
