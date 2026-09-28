<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Give the raster exports a background, which the code says they already have. Severity: 7/10

Existing Issue: `pixelsOf` in `web/src/plugins/visualizations/export/download.ts` sets the canvas background from `getComputedStyle(svg).backgroundColor || '#ffffff'`, but nothing gives an `svg` a background, so the computed value is `rgba(0, 0, 0, 0)` — truthy — and the `||` fallback never fires, so the fill paints nothing. Severity: 7/10

Existing Risk: 7/10 - The default theme is dark, so a near-white title, tick and axis line lands on a transparent or white page and is effectively invisible when the export is opened anywhere. The comment above the line states the opposite is prevented, and the style contract pins the custom-property list but not the background, so nothing notices.

Proposal Risk: 2/10 - Reading the theme's own `--bg` instead of the element's computed background fixes it for every theme at once, and changes nothing about what is drawn.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1440: paint the raster exports with the theme's own background". In `pixelsOf` in `web/src/plugins/visualizations/export/download.ts`, take the fill from the `--bg` custom property already in `CHART_PROPERTIES` and fall back to white only when it resolves to nothing, rather than from the element's transparent `backgroundColor`. Verify with a case in a new `web/src/plugins/visualizations/export/download.test.ts` asserting the chosen fill is the resolved `--bg` and not the transparent computed colour, and with a case asserting the fallback when `--bg` is absent.

* Prune the datasets a removal orphaned, even when some other id in the same list was wrong. Severity: 6/10

Existing Issue: `remove` in `src/visualizations/agent.ts` only calls `pruned` when nothing in the batch was refused, and `reply.ts` accepts up to sixteen arbitrary strings in `remove`, so one invented id alongside a real one skips the pruning that keeps `MAX_DATASETS` a bound on what is in use. Severity: 6/10

Existing Risk: 6/10 - Each such turn leaves an acquired-file dataset holding a slot with nothing reading it, and after seven of them every chart naming a new file is refused with "this one already reads them all" while only the source is actually in use. It is wasted capacity rather than an unreadable record, but it is permanent for that record.

Proposal Risk: 2/10 - Pruning drops a dataset nothing reads, which is already the rule, and the chart it belonged to is gone either way.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1440: prune orphaned datasets even when part of a removal was refused". In `remove` in `src/visualizations/agent.ts`, call `pruned` after the loop rather than only when `refused` is empty, since the datasets that survive are exactly those still read by a remaining chart. Verify with a case in `src/visualizations/agent.test.ts` removing a real chart id beside an invented one and asserting the dataset it was the only reader of is gone, and a case asserting a refused id alone still leaves a dataset alone.

* Release a read's in-flight mark when the read throws, so a chart does not stop updating for the life of the process. Severity: 6/10

Existing Issue: `reader` in `src/visualizations/reading.ts` adds its key to `inFlight`, awaits `options.read`, and deletes the key afterwards with no `try` around either, and the caller discards the promise, so a throw from the read leaves the key in place. Severity: 6/10

Existing Risk: 6/10 - Every later read of that dataset returns `undefined` at the in-flight check, so the chart silently stops updating with no error anywhere while the poll keeps re-arming — the failure is indistinguishable from a source that has gone quiet, and it lasts until the process restarts.

Proposal Risk: 2/10 - Wrapping the read and the work after it in a `try`/`finally` releases the key on every path, and nothing else about the read changes.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1440: release a read's in-flight mark when the read throws". In `reader` in `src/visualizations/reading.ts`, delete the key in a `finally` around the read and the work that follows it, and record the failure on the dataset the way a returned error is recorded so the chart shows a reason rather than going quiet. Verify with a case in `src/visualizations/reading.test.ts` whose read throws, asserting the second read for the same dataset is attempted and that the dataset carries the reason, and a case asserting a rejected read is not observable as an unhandled rejection.

* Index the value arrays a notice walks by the same row it labels, or say no count. Severity: 6/10

Existing Issue: `outliers` in `src/visualizations/insights.ts` says "the middle half of the ${values.length - 1} other values", computing "other" as one less than the total however many rows were outside the fences, so with two outliers it claims one more other value than there are. Severity: 6/10

Existing Risk: 5/10 - The figure a reader checks the notice against is wrong by the number of other findings, which is the only thing that makes a stated rule checkable, and the test pins the wording for the single-outlier case where it happens to be right.

Proposal Risk: 2/10 - The count is the size of the group that was judged minus the rows named, and nothing else reads it.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1440: count the other values a fence notice is about correctly". In `outliers` in `src/visualizations/insights.ts`, compute the "other" figure as the number of rows that were inside the fences rather than as the total less one, and say so in the sentence. Verify with a case in `src/visualizations/insights.test.ts` planting three outliers and asserting the sentence's count, and the existing single-outlier case unchanged.

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
