# Give every mark an accessible name, and record the palette gap with its measurements

Two halves, and only one of them was deliverable.

**Done: the marks.** The root `<svg>` already carried `role="img"`, a `<title>` and a `<desc>` built from the same marks, and the data table already set `scope="col"` — so the short name and the long description WCAG 1.1.1 Situation B asks for were already there, and the finding's premise about them was wrong. What was missing was the marks themselves. Observable Plot puts an `aria-label` on each mark's `<g>` and an `ariaHidden` option for the marks that are decorative; here every bar, scatter dot and series now carries a name built by `markLabel` in `chart/describe.ts`, beside the sentences the caption is built from, so a mark announced with a different number than the one on screen is not possible. A value that cannot be drawn is named as nothing rather than as a number that is not there.

**Not done: the palette.** The series ramp is five theme tokens — `accent`, `success`, `running`, `error`, `muted` — and `success` and `error` are a green and a red, which is the pair SC 1.4.1 names as a failure. Observable Plot and Vega-Lite both draw on a CVD-validated qualitative scheme (tableau10, ColorBrewer), and Datawrapper runs a contrast simulation over the chosen palette against all three forms of colour-vision deficiency and warns inline when pairs become indistinguishable.

I built the ramp and measured it, and it does not clear the bar it would have to clear. Okabe-Ito is the obvious candidate and it separates by hue, but contrast is a separate axis: a single ramp that clears 3:1 against all six application themes while keeping eight hues mutually distinguishable is not one ramp, it is six. Measured worst-case ratios of the two published Okabe-Ito forms against each theme's background:

| theme | deep form | light form |
| --- | --- | --- |
| dark (`#17181b`) | 2.25 | 3.42 |
| light (`#ffffff`) | 2.25 | 2.09 |
| solarized-dark (`#002b36`) | 2.09 | 2.90 |
| solarized-light (`#fdf6e3`) | 2.09 | 2.32 |
| nord (`#2e3440`) | 1.63 | 2.41 |
| dracula (`#282a36`) | 1.86 | 2.75 |

Only one of twelve cells clears 3:1. Darkening or lightening the hues until they do collapses the distinctions Okabe-Ito exists to preserve, so a ramp that clears the bar is a per-theme design task rather than a substitution — and shipping one that fails the bar it was introduced under would be worse than shipping the pair it replaces and saying so. The plugin's own stylesheet is not the place either: the style contract holds it to theme custom properties only, and a ramp defined there would not be resolved by the export path. It belongs in `web/src/theme.css`, beside `--accent` and `--error`, once it is designed per theme.

`SERIES_COLOURS` keeps its five tokens with a comment saying what is being tracked. The export path and the style contract are unchanged, so nothing about the current export is left half-done.

The labelling is tested: `web/src/plugins/visualizations/chart/describe.test.ts` covers the name with and without a series, a value that is not a number, and the rounding that matches the axis; `VisualizationChartCard.test.tsx` asserts a rendered bar's `aria-label` names its category and its value. The spec gains a sentence about what a screen reader is given.
