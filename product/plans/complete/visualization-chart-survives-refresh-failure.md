# Keep a chart on screen when a refresh fails

**Complexity: 2/10** — one region-selection change in one client component, two test cases, and no server behavior. The manager already keeps the previous table on a failed re-read, so only the client half of the promise is unmet.

The spec and the pull request description both say a source which stops answering leaves the previous chart on screen. The shipped body does the opposite: it checks `error` before the chart, so a failed re-read replaces a working chart with a failure screen. That is the opposite of the promise, and it costs the user the chart at the moment the feature is most worth having.

## Design decision

A window that has a chart and a table renders the chart, and carries its recorded error as a line above the figure rather than in place of it. Only a window with no table falls through to the full reason region, because that is the case where there is nothing to keep on screen.

The distinction is between a failure that lost the data and a failure that followed data the tab already had. A 500 on the first read is the first kind: there is no chart, and the reason is the whole story. A 500 on the tenth poll is the second: the chart is still true of the data it was drawn from, and the reason is a note about the next read.

The error reaches `Drawn` as an optional prop rather than by being read from the record again, so the region that renders it is passed what it needs rather than reaching back for it.

## Implementation steps

1. In `web/src/plugins/visualizations/VisualizationBody.tsx`, remove the `view.error` check from `VisualizationBody`'s dispatch and let a window with a chart reach `Drawn`; pass `view.error` into `Drawn` as a `reason` prop.
2. Render the reason inside `Drawn`, above the figure, using the existing `.visualization-reason-text` styling, so it reads as a note on the metadata rather than as a page of its own. Keep the caption line as it is.
3. Keep `Reason` as the region for a window with no table, unchanged, and keep its source-replacement and ask-again controls.
4. `web/src/plugins/visualizations/visualizations.css` needs no change: `.visualization-reason-text` is already defined and already used inside a chart-bearing region by nothing, so this gives it its first use.

## Tests

- `web/src/plugins/visualizations/VisualizationTab.test.tsx`: a window carrying both a chart and an `error` renders `svg.visualization-chart` **and** the error text; a window carrying an `error` and no `table` renders the reason region with its controls and no chart.

## Out of scope

- Changing what the manager does on a failed re-read. It already keeps the previous table, which is the half that is correct.
- Making the reason dismissible, or a stale-data marker beyond the reason line.
- The `visualizations-style.test.ts` assertions, which name class names this change does not touch.

## Verification

`./scripts/run.mjs check-diff`, plus: open a drawn visualization, set a 10-second refresh, stop the endpoint, and confirm the chart stays on screen with the reason above it and the caption's read time unchanged.
