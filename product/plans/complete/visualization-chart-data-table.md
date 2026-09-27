# A data table and a text summary behind every chart

## Complexity

4/10 — client-only, additive, and confined to the chart's own directory. It adds a pure describe module, two attributes and two elements in existing components, styles reusing properties the stylesheet already paints, and tests. Nothing in `src/` moves, and no payload, topic action, or protocol type changes.

## Goal

A chart is a picture of a table, and a screen reader is currently told the picture's title and nothing else. This gives every drawn chart three things: a `<title>` and `<desc>` inside the SVG, a reachable `<table>` of the marks the chart actually draws, and a one-line written summary. The table and the summary are derived from the same marks the renderer draws, so they cannot drift from what is on screen.

## Decisions

**1. The describe logic lives in a new `chart/describe.ts`, not in `points.ts`.** The backlog entry proposed building the summary beside the marks in `points.ts`, which is the right *source* but the wrong *home*: `points.ts` is the chart's arithmetic and is already 120 lines, while a data table is a presentation artifact over those marks. A sibling module keeps both single-purpose and leaves `points.ts` free to grow when the aggregate and date-axis work lands in the same directory. Both modules call `marksFor`, which is what actually guarantees the two cannot disagree — not their physical location.

**2. Both the `<desc>` and the visible table call `marksFor` on the same `(table, chart)`.** `marksFor` is pure, so calling it twice yields the same marks. Sharing one computed value across two components would need a `useMemo` in a parent that has no other reason to hold chart data; the purity of the existing module is the cheaper guarantee. The scatter and pie cases read `scatterFor` and `marks.slices` respectively, because a scatter's rows are x/y pairs and a pie's are summed categories, and a table of band/value pairs would be a different table from either chart.

**3. The table sits behind a `<details>` toggle labelled "Data table".** The default view of this feature is a chart, and an always-open 500-row table would bury it and change what the tab is for. A `<details>` is one keystroke away, needs no state, and is announced by the browser as a disclosure. Its `<summary>` is a real button for keyboard users with nothing to add.

**4. The table stays out of the PNG and PDF export paths.** Both rasterize the `<svg>` element, and an image of a table is not a text alternative — shipping it would put a false affordance in the exported file. This is a deliberate limit, not an oversight.

**5. The stylesheet reuses only custom properties it already paints.** `visualizations-style.test.ts` asserts that the set of `var(--…)` names in the stylesheet equals exactly the set the export path resolves. A new property name would break that pairing, so the new rules use `--border`, `--muted`, `--fg`, `--bg-soft`, and `--accent` and add no colour.

## Implementation

1. **`web/src/plugins/visualizations/chart/describe.ts` (new).** Two pure functions over `(table, chart)`, plus their return types:
   - `describeChart(table, chart): string` — one sentence naming the kind, the measure, its range, and the largest and smallest mark. Built from `marksFor`, or from `scatterFor` and `marks.slices` for the two kinds whose rows are not band/value pairs. An empty chart describes itself as having nothing to plot rather than producing a sentence about an empty range.
   - `dataTableFor(table, chart): DataTable` — `{ columns, rows }`, where each column is `{ name, numeric }` so the renderer can mark the numeric cells and screen readers get an aligned column. One row per drawn mark, carrying the category, the measure, and the series when the specification names one.

2. **`web/src/plugins/visualizations/chart/ChartSvg.tsx`.** Replace `aria-label={chart.title}` with `aria-labelledby` pointing at a `<title>` and a `<desc>` that are real children of the `<svg>`, keeping `role="img"`. Ids come from `React.useId()` so two charts in one document cannot collide. A comment records why both attributes are present: a bare `<title>` is exposed inconsistently across screen readers, so the explicit label is what names the element and the title is what the element is. The visible `<text>` title stays as it is — removing it would change the rendered chart, which is not what this entry is about.

3. **`web/src/plugins/visualizations/VisualizationData.tsx` (new).** The summary sentence and the `<details>` disclosure holding the table, as its own component. `VisualizationBody.tsx` is at 166 lines against a 200-line ceiling and cannot absorb the table's markup inline, so the extraction is what keeps the change legal rather than a preference.

4. **`web/src/plugins/visualizations/VisualizationBody.tsx`.** Render `<VisualizationData>` inside the `Drawn` branch, directly under the `<figure>`, so it belongs to the chart rather than to the exchange below it. Nothing else in that file changes: a failed re-read still keeps the chart, and the empty and error branches stay exactly as they are.

5. **`web/src/plugins/visualizations/visualizations.css`.** Rules for the summary text, the disclosure, and the table — a rule-lined grid, right-aligned numbers, and a scroll container so a long table does not push the chart off screen. Existing custom properties only.

## Tests

- **`web/src/plugins/visualizations/chart/describe.test.ts`** (new) — the summary names the kind, the measure, its range, and both extremes for a bar chart; a pie describes the summed categories rather than band/value pairs; a scatter describes its x and y columns; an empty chart describes having nothing to plot and produces no table rows; the table carries a series column only when the specification names one; the table's numeric flag follows the measure and not the category; a column named `a` and another named `b` cannot be confused, which a positional table would let through.
- **`web/src/plugins/visualizations/VisualizationTab.test.tsx`** (extended) — the `<svg>` carries `role="img"` and an `aria-labelledby` that resolves, through `document.getElementById`, to a `<title>` and a `<desc>`; the `<desc>` names the measure; the disclosure is present and its table's header cells carry `scope="col"`; the table's rows match the marks. The existing "keeps the chart on screen when a re-read has failed" case keeps its shape, since a failed re-read must not cost the data table either.

## Out of scope

- **A per-mark description or keyboard navigation between marks.** A screen reader reaching the table is the gap this entry closes; roving focus through SVG marks is a different feature with its own trade-offs.
- **A browser for the whole source table.** The table shows the marks the chart draws, not all 500 rows of all 32 columns, which is what makes it trustworthy as an alternative to the picture.
- **Exporting the table**, to CSV or otherwise. Both existing exports rasterize the chart, and adding a third format is a separate decision.
- **Choosing a colour-blind-safe palette.** Real, and independent of having any text alternative at all; it belongs to the palette rather than to accessibility of the markup.
- **Any change under `src/`.** Nothing here is server-visible, so the host, the payload, and the topic actions stay as they are.
