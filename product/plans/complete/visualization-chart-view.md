# A chart that can be sorted and narrowed without asking again

## Complexity

6/10 — client-only and additive, but it threads a view through three consumers that must agree, adds three controls to a component already near the file-size ceiling, and has to keep the data table and the chart's spoken description describing what is actually on screen rather than what the source holds.

## Goal

Every answer to a follow-up question about a chart currently costs a model call and a visible wait, so the feature is slow at exactly the moment it is being used to explore. This adds a view over the marks the tab is already holding: an order, a cap on how many categories are drawn, and a filter down to one category. None of it is stored, none of it is the model's to choose, and none of it changes what the host holds.

## Decisions

**1. The view lives in a new `chart/view.ts`, not in `points.ts`.** The recorded proposal put it in `points.ts` "beside the marks they order", which is the right source and the wrong home: `points.ts` is 210 lines against a 200-line ceiling, and the view is a separable concern from the arithmetic. `points.ts` stays the only place marks are computed; `view.ts` only reorders, drops, and renumbers what it is handed, which is why the view can be tested without a table at all.

**2. One function composes the two, and all three consumers go through it.** The chart, the data table, and the spoken description must describe the *viewed* marks or the properties the previous entry established come apart: a table listing rows the chart no longer draws, or a sentence spanning categories the chart dropped, is the exact silent-wrongness this feature keeps fixing. `viewedMarksFor(table, chart, view)` is called by `ChartSvg`, `describeChart`, and `dataTableFor`, so there is one composition rather than three that can drift. It lives in `view.ts` because it is the view's entry point.

**3. A narrowed chart is labelled as narrowed, always.** The caption gains the cap and the filter, and the data table follows the same view. A chart showing five of twelve regions with nothing saying so is a chart lying by omission, which is worse than the slowness this entry removes.

**4. The narrowing is a labelled control, not a click on a mark.** The recorded proposal asks for a cross-filter by clicking a bar or a point. For a bar that is easy; for a line and an area it means invisible per-band hit targets over a drawn path, and for a pie it means wedge geometry — three different mechanisms, none of them keyboard-reachable, and none of them testable without asserting on synthetic pointer events. A `<select>` labelled with the category does the same thing identically for all five kinds, is announced properly, and is one line to test. The capability the gap names is delivered; the gesture is not. Clicking a bar remains a reasonable later addition once there is a hit-target convention to share across the three banded kinds.

**5. The cap is in bands, not in marks.** "Top 5" has to mean five categories, or a split chart would drop some of a category's series and leave the rest — a chart with a bar of a different height than its neighbour and no explanation. So the cap keeps the five bands with the largest values and drops every mark in the others, and `viewMarks` renumbers what survives so the axis has no holes.

**6. Ordering is stable and total.** Sorting by value descending would otherwise be free to reorder two equal values differently on two runs, and the source order is the tiebreak that keeps a chart reproducible.

**7. A re-read clears the view, because the view is about the data that was there.** A view held across a re-read narrows a table the user never saw. The reset keys on `readAt`, which is the one field that changes when new data arrives, and `readAt` is absent until a read has succeeded, so a visualization read for the first time starts unviewed.

**8. The default is the chart as the model specified it** — source order, no cap, no filter — so a chart that nobody touches is byte-for-byte the chart that shipped, and `viewMarks` with the default view returns its input unchanged.

## Implementation

1. **`web/src/plugins/visualizations/chart/view.ts` (new).** `SortOrder` (`'source' | 'category' | 'value'`), `ChartView`, `DEFAULT_VIEW`, `viewMarks(marks, view)`, and `viewedMarksFor(table, chart, view)`. `viewMarks` filters, orders, caps, and renumbers, and is pure over marks it is handed.
2. **`web/src/plugins/visualizations/chart/ChartSvg.tsx`.** Take the view and call `viewedMarksFor`. The `<desc>` follows automatically, since it is generated from the same marks the chart draws.
3. **`web/src/plugins/visualizations/chart/describe.ts`.** `describeChart` and `dataTableFor` take the view and compose through `viewedMarksFor`, so the sentence and the table describe the chart on screen.
4. **`web/src/plugins/visualizations/VisualizationData.tsx`.** Take the view and pass it down. A table of the viewed marks is the table of the picture, not of the source.
5. **`web/src/plugins/visualizations/ChartControls.tsx` (new).** The three controls: a sort select, a top-N select, and a category filter select. A component of its own because `VisualizationBody` is at 172 lines and cannot absorb them, and because a control row is the same shape in every state that draws a chart.
6. **`web/src/plugins/visualizations/VisualizationBody.tsx`.** Hold the view, render the controls, pass the view down, extend `caption` with the cap and the filter, and reset the view when `readAt` changes.

## Tests

- **`web/src/plugins/visualizations/chart/view.test.ts`** (new) — the default view returns its input unchanged; each order; a cap keeps whole bands rather than whole marks; a filter keeps one category's marks and drops the rest; marks are renumbered densely after any of the three; two equal values keep source order; a cap larger than the data changes nothing; a filter naming a category that is not present leaves the marks alone.
- **`web/src/plugins/visualizations/chart/points.test.ts`** — untouched, and the suite that proves it: every existing expectation is a chart with the default view.
- **`web/src/plugins/visualizations/chart/describe.test.ts`** — a described chart names its cap and its filter, and an unviewed chart's sentence is unchanged.
- **`web/src/plugins/visualizations/VisualizationTab.test.tsx`** — the controls are offered once there is a chart and emit nothing; changing the order reorders the drawn bands; a cap narrows the table as well as the chart; a filter narrows both; the caption names what was narrowed; a narrowed chart and an unnarrowed one differ.

## Out of scope

- **Clicking a mark to cross-filter.** Named in decision 4, with the reason and the condition under which it becomes reasonable.
- **Brushing, lassoing, or a range selection over an axis.** Every one of those is a pointer-interaction convention with a keyboard equivalent to design; a category filter is the whole of it at a size this tab can hold.
- **Remembering a view across a re-read, a relaunch, or a reopened tab.** The view is a way of looking at the table that is in front of you, not a property of the visualization. Storing it is a wire field and a host decision, and this entry deliberately adds neither.
- **The view reaching the model.** Asking "what are the top five regions" is a different question from sorting by them, and conflating them would let a sort silently change what the model was asked.
- **Any change under `src/`.** None of this is server-visible, so the host, the payload, and the topic actions stay exactly as they are.
