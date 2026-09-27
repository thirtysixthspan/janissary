# A chart specification that names an aggregate

## Complexity

6/10 — the change crosses the wire contract, three independent guards, the prompt contract, the mark arithmetic, and two places that describe a chart in words. No new subsystem and no new dependency, but every one of those guards has to agree with the others or a stored chart stops being readable.

## Goal

A source whose grain is finer than the question cannot be charted at all today: "revenue by region" against one row per transaction draws one bar per transaction, with the right axis labels and the wrong number beside each of them. This gives a chart specification an optional aggregate, applies it where the marks are built, and says in every place the chart is described that the numbers are aggregated.

## Decisions

**1. `aggregate` is optional, and its absence means no aggregation.** Six values would have been the alternative — `'none'` alongside the five — and an absent field is the better shape: a specification written before this field existed is still valid, and `marksFor` needs no branch to tell "raw" apart from "explicitly raw".

**2. `count` counts the rows that survive the drop rule, and nothing else.** Counting every row would make `count` disagree with every other aggregate about which rows exist, and would mean a column of blanks was counted in one chart and ignored in the next. So a row whose measure is not a number is not plotted and is not counted, and the prompt says so in as many words. This costs `count` its use as a way of charting a purely categorical column, which is a real limitation and a much smaller one than an aggregate whose meaning depends on the kind beside it.

**3. An unrecognized aggregate fails the whole specification rather than being dropped.** Every other optional string field on a chart is dropped when it is the wrong shape, because losing a label costs a label. An aggregate dropped silently costs the *meaning of every number in the chart* while still drawing successfully, which is the failure this feature exists to remove. `chartOf` returns undefined, the same as for an unrecognized `kind`, and the tab shows the reason and the interview retries.

**4. The aggregate is applied in `marksFor`, and the pie's sum becomes that same aggregate.** The pie is currently the one aggregation in the grammar and it is hard-coded in `slicesFor`. Giving the general case its own path and leaving the pie's beside it would mean two places that aggregate, and they would disagree the first time a new aggregate appeared. A pie with no aggregate still sums, so nothing that works today changes.

**5. Aggregation groups by category, and by series within a category.** Bands are the x axis's slots and the bar renderer already offsets series *within* a band, so the band has to be the category's index and the series has to share it. Grouping by the pair would renumber the axis and move every series into its own band, which is a different chart.

**6. Aggregated bands are contiguous, which the raw path is not.** A raw mark keeps its source row as its band, so a dropped row leaves a gap with nothing in it. The aggregate path has no rows left to drop by the time it numbers its bands, so its bands are dense by construction. The raw path's gap is a pre-existing misalignment — the category axis labels band `n` with the *n*-th *point*, so a dropped row shifts every label after it — and this change does not touch it, because widening into it would make a review of this entry unverifiable. It is recorded under Out of scope for a cycle of its own.

**7. Three places describe a chart in words, and all three learn the aggregate.** The tab's caption, the data table's summary sentence, and the sentence the model leaves behind when it changes a chart and explains nothing. A summed bar that reads as a raw value in any one of them is the exact silent-wrongness this work is for.

**7. The reduction is its own module, not more of `points.ts`.** `points.ts` was 120 lines and became 205 with the reduction folded in, past the 200-line ceiling, and the two are separable concerns: one turns a table into marks, the other turns a group of rows into one number. A sibling `aggregate.ts` also makes the reduction testable without going through `marksFor`, which is where a wrong aggregate would otherwise hide.

**8. The pie's built-in `<desc>` is removed rather than left to compete.** `CartesianChart` already emitted a `<desc>` saying how many rows were plotted. It carried no id, nothing named it, and once the root names and describes itself it is a second weaker description of the same element. Leaving it would mean a screen reader is handed two descriptions, one of which says nothing.

## Implementation

1. **`src/protocol/visualizations.ts`.** Add `VisualizationAggregate = 'sum' | 'mean' | 'count' | 'min' | 'max'` and an optional `aggregate` on `VisualizationChartView`, documented as applying to `y` before the marks are built.
2. **`src/plugins/visualizations/shared.ts`.** Mirror the type and the field, and add the set to `isChart`. A payload guard that accepted an unknown aggregate would let a bad specification past the plugin boundary, where nothing checks it.
3. **`src/visualizations/store.ts`.** Extend the record's `isChart` with the same set, so a persisted chart whose aggregate is not one of the five is refused at read time rather than drawn raw.
4. **`src/visualizations/chart-spec.ts`.** Refuse an aggregate outside the five with a reason naming it. This is the gate the entry names, and it is where an unknown value belongs: a model is the thing that produces unknown values, and this is the one place every specification passes through.
5. **`src/visualizations/prompts.ts`.** Export `AGGREGATES`, state the field in `chartPrompt`'s prose with one worked example, add it to the example JSON in both chart prompts, and parse it in `chartOf` so an unknown value fails the specification per decision 3.
6. **`web/src/plugins/visualizations/chart/aggregate.ts` (new) and `web/src/plugins/visualizations/chart/points.ts`.** The reduction lives in a new sibling module: `Aggregate`, `effectiveAggregate`, `groupsFor`, and `reduce` are one concern — how a group of rows becomes one number — and folding them into `points.ts` took it to 205 lines, past the ceiling, for a file whose job is turning a table into marks. `points.ts` keeps `marksFor`, which resolves the effective aggregate, and the pie's `slicesFor`, which is that same reduction over categories alone. In `marksFor`, when there is an aggregate, group the surviving values by category and series, reduce each group, and emit one point per group with a dense band.
7. **`web/src/plugins/visualizations/chart/CartesianChart.tsx` and its one caller.** Remove the `<desc>` this diff's predecessor left inside the drawn `<g>`. It said only how many rows were plotted, it carried no id and was named by nothing, and now that the chart's root names and describes itself it is a second, weaker description of the same element rather than a fallback for a missing one. The `table` prop that fed it goes with it, which is what makes this file's own comment — that nothing here reads the table — true rather than aspirational.
8. **`src/visualizations/interview.ts`.** `chartSummary` names the aggregate, and `redrawn` treats a changed aggregate as a redraw, so a chart that only changes how it aggregates still takes the visualization's title from the model.
9. **`web/src/plugins/visualizations/chart/describe.ts`.** The summary sentence names the aggregate, so the chart's text alternative cannot describe a sum as a raw value.
10. **`web/src/plugins/visualizations/VisualizationBody.tsx`.** The caption names it, next to the row count, so it is visible without opening anything.

## Tests

- **`src/visualizations/chart-spec.test.ts`** — each of the five is accepted; an unknown one is refused with its name in the reason; an absent one still passes, so a specification written before this field exists is not broken.
- **`src/visualizations/prompts.test.ts`** — a reply naming an aggregate parses; a reply omitting it produces a chart with no aggregate; a reply naming an unknown one produces no chart at all rather than one without the aggregate; the chart prompt names the field and the allowed values.
- **`web/src/plugins/visualizations/chart/points.test.ts`** — each aggregate over a fixed table; a category appearing in two series yields two points sharing one band; a pie with no aggregate still sums; a pie with an explicit `mean` takes the mean rather than the sum; a raw chart is byte-for-byte unchanged, which is the case that must not regress.
- **`web/src/plugins/visualizations/chart/describe.test.ts`** — the sentence names the aggregate, and a raw chart's sentence is unchanged.
- **`web/src/plugins/visualizations/VisualizationTab.test.tsx`** — the caption shows the aggregate, and a chart without one shows no aggregate text.
- **`src/visualizations/interview.test.ts`** — `chartSummary` names the aggregate, and a change of aggregate alone counts as a redraw.

## Out of scope

- **The raw path's band gap.** Pre-existing, and described in decision 6. Worth its own entry; mixing it in here would make this change hard to attribute when something breaks.
- **Aggregating the x column, or grouping by anything but `x` and `series`.** A second grouping key is a new column role in the grammar rather than a field on the one that exists.
- **A `median`, a `distinct`, or a percentile.** Each is a real aggregation and each is a decision about a distribution the model would be choosing; the five here are the ones a reader can check by eye against a data table.
- **The model choosing an aggregate the user did not ask for.** The interview prompt asks for it and the tab shows it, but nothing prevents a model aggregating when a raw chart would have answered the question; that is a prompt-tuning question, and the caption makes the outcome visible either way.
- **Any change to how a source is read.** The aggregation happens over the table that is already on screen, so nothing about fetching, parsing, or row caps moves.
