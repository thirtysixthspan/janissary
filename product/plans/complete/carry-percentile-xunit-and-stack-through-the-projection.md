# Carry `percentile`, `xUnit` and `stack` through the projection

Three features existed and did nothing. `chartViewOf` in `src/visualizations/charts.ts` copied `kind`, `x`, `y`, `title`, `series`, `aggregate`, `xLabel` and `yLabel` by hand, and the three fields the last three commits added were not among them — all three are optional on `VisualizationChartView`, which is `ChartShape & {…}`, so the projection satisfied its type and the compiler said nothing.

The consequences are not equal, and the worst is a number that is confidently wrong:

- a percentile chart reached the renderer with no percentile, so `reduce` fell back to its default of 50 and the bars were drawn at the **median** while the caption and the turn's sentence said "reduced to the 95th percentile" — a chart stating a figure that is not the one on screen, which is the one failure a chart cannot make;
- a stacked chart was drawn side by side, with the y domain built from segment tops rather than band totals and the caption silent about it;
- a monthly chart's data was correctly bucketed by the server, and its axis read `2026-01-01 … 2026-12-01`.

`chartViewOf` now copies the specification whole and removes only the transformations by name, so a field the grammar gains later cannot be left behind the same way. The transformations are the one thing that is genuinely different between a stored chart and a shown one: the browser receives the words they became, and re-declaring a four-step grammar plus its guards in the import-free contract purely to render six words is the mirroring that produces drift.

`points.test.ts` pinned stacking and the percentile against the marks builder, so both looked covered — the untested seam was the projection, and there was no server test for `chartViewOf` at all. There is now a `src/visualizations/charts.test.ts` with the whole specification carried, the transformations as words and not as the grammar, every optional field omitted when a chart did not state it, and the data reference copied rather than shared; a case in `manager.test.ts` driving a reply with a percentile, a stack and a unit all the way to the payload; and a case in `VisualizationChartCard.test.tsx` asserting a monthly chart's axis says `Jan 2026` rather than the ISO date underneath it.
