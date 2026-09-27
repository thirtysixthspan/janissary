# Visualizations

Point at a data source, answer a few questions about it, and get a chart you can change by asking and keep by saving.

```
visualizations
```

## Name a source

A source is a URL or a path to a file. The quickest way to name one is to select it anywhere you can select text and choose **Visualize this** from the right-click menu. The selection is used as-is, so whatever you had selected becomes the source.

The other route is the **＋** button in the index header, which opens a field. Type a URL or a path and press **Visualize**.

Both routes open a new tab. It reads the source, then asks you what to look at.

What can be read:

- **JSON** — an array of objects, or an object holding one. `{"data": {"items": [...]}}` works too.
- **Delimited text** — comma, tab, semicolon, or pipe, with a header row. Quoted fields are fine, and so is a quoted field containing the delimiter.

Column types are worked out for you, so you never pick them. A column of numbers is a measure you can plot; a column of anything else is a category you can group by. Dates are treated as text, which means a date column works as an axis but is not measured.

A local file has to be inside this project directory or your home directory. Anything else is refused and says so. Symlinks are followed before the check, so a link pointing outside those two directories is refused too.

Pointing a visualization at a local file means the file is read, turned into a table, and kept in the visualization's saved record, and a sample of it is sent to the model to ask the questions. Don't point one at a credentials file.

## Answer the questions

<img class="agent-float" src="/agents/malik-south-west.png" alt="" />

The model looks at a sample of the data and asks what it needs to know: which measure to plot, what to compare against, how to split it, what to call the result. It asks one question at a time.

Each question shows the answers it expected as buttons. Click one, or type your own into the field — the useful answer is often none of them.

Answering the last question produces the chart.

## Read the chart

The chart fills the tab, with its title above it and the row count below. When the source has more rows than the chart shows, the line under the chart says how many of how many.

**Data table**, under the chart, opens the numbers behind the picture: one row per mark the chart draws, with the series column too when the chart is split by one. It also states the chart in a sentence — the kind, the measure, its range, and its largest and smallest mark — which is what a screen reader is given in place of the drawing, along with the chart's title. Both are built from the same marks the chart is drawn from, so they cannot disagree with it. Neither is part of an exported file.

**Export as PNG** and **Export as PDF** write a file named after the chart, at twice the size it appears in the tab. Both buttons are greyed out until there is a chart to export.

You can rename the chart by double-clicking its name in the header.

## Change the chart

Type into the bar at the bottom the way you would in a terminal. Press `Enter` to send, `Shift+Enter` for a newline, and `Escape` to clear what you have typed.

Ask for what you want: *make it a line chart*, *split by region*, *show visits instead of revenue*. The model answers with an updated chart, and its explanation appears above the bar. The whole exchange stays in the tab, so you can see what you asked for and what came back.

## Keep it current

A visualization reads its source once and then leaves it alone. To have it re-read on a timer, pick an interval from the **Refresh** menu in the header: off, 10s, 30s, 1m, or 5m.

**Refresh** in the header re-reads right now without changing the interval. A re-read only happens while that tab is open, so nothing is fetched in the background once you close it.

When a re-read fails, the reason appears in the tab and the chart you already had stays on screen.

## When something goes wrong

- **The source could not be read.** The reason is in the tab. Press **Change the source** to point at a different one.
- **The data could not be understood.** The reason says what was wrong with it. **Change the source** and try another.
- **The model asked nothing.** There is nothing to answer. **Ask again** starts over.
- **The model asked for a chart the data cannot show.** The reason is in the tab, and the questions you answered are kept. **Ask again** retries.

Changing the source throws away the questions and your answers, so it asks first. Once there is a chart the source cannot be changed, because every answer you gave was about the old data, and the control is not shown then.

## Reopen and delete

Saved visualizations are listed by most recent activity. Click a row twice to open it — the first click selects, the second opens, exactly as the conversation list behaves. You can also open one by name:

```
visualizations Revenue by region
```

Matching ignores case. The words `left` and `right` are reserved for docking.

`visualizations left` and `visualizations right` dock the index in a sidebar. Bare `visualizations` brings it back to the center. See [Tabs](/user-documentation/getting-started/tabs) for shared sidebars.

Deleting asks first, and removes the visualization, its saved data, and its private workspace. A tab that was open for it stays open, saying the visualization was deleted, with its controls disabled — close it when you are done with it.
