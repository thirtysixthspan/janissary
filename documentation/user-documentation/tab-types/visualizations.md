# Visualizations

Point at data, say what you want to see, and get a chart you can change by asking. Everything that changes a chart is a sentence you type.

```
visualizations
```

## Start a chart

Press the **＋** button in the index header. The new tab opens with one line and a box to type in:

> Paste the URL of a data file, or of a page that describes an API, and tell me what you would like to see.

Paste the address and, if you like, a sentence about what you want out of it. There is no form and no field to fill in.

The fastest route to a new tab is to select an address anywhere you can select text and choose **Visualize this** from the right-click menu. Your selection becomes the first message.

A visualization you start but never say anything to is not saved: it does not appear in the index, and nothing is written to disk.

## What a source can be

A source is a web address or a path to a file, written anywhere in what you type. The most recent address you name is the one being worked on, so pointing somewhere else part way through is ordinary.

- **A file of values** — JSON, or delimited text. JSON must be an array of objects or an object holding one; `{"data": {"items": [...]}}` works too. Delimited text needs a header row and uses a comma, tab, semicolon or pipe; quoted fields are fine, including one containing the delimiter.
- **A page describing an API** — documentation, an OpenAPI file, an endpoint. The agent works out how to reach the data behind it, fetches it, and carries on. A chart built that way names the file it read underneath, so you can tell a picture that is current from one that stopped a while ago.

A local file has to be inside this project directory or your home directory. Anything else is refused and says so. Symlinks are followed before the check, so a link pointing outside those two directories is refused too.

Pointing a visualization at a local file means the file is read and a sample of it is sent to the model to answer your question. Don't point one at a credentials file.

Columns are worked out for you: a column of numbers is a measure you can plot, a column of ISO dates (`2026-01-31`) is read in date order, and anything else is a category you can group by. If one is read wrong, say so — *treat the `total` column as a number* — and the rest of the conversation is built on the corrected reading.

## What you can ask for

**A different chart.** Its kind, the columns it plots, the column that splits it into series, how the measure is reduced, its title, and its axis labels. *Make it a line chart.* *Split by year.* *Sum the revenue rather than counting rows.* *Call it Revenue by region.*

**The data, transformed.** Four things, applied in order and each one named in the line under the chart:

- **filter** — *only 2024*, *just the north region*, *where revenue is over 500*.
- **derive** — a new column computed from the ones you have. *Add revenue per employee.* *Margin as a share of revenue.* The expression uses numbers, column names, `+ - * /`, and brackets, and nothing else.
- **sort** — *largest first*, *in alphabetical order*.
- **limit** — *the top ten*. Counted in categories rather than rows, so a chart split into series loses a whole bar rather than half of one.

A sort followed by a limit is a top-ten; the reverse is the first ten.

**Another chart.** *Also plot revenue per employee by region* adds one beside the first. A visualization holds up to eight.

**A name.** *Call this Revenue by region* renames the tab, the index entry and the saved record. A name you have given is not overwritten by a later chart's own title.

Type into the bar at the bottom the way you would in a terminal. Press `Enter` to send, `Shift+Enter` for a newline, and `Escape` to clear what you have typed, or to stop a reply in progress.

Above the bar, the model usually offers two to four things you could ask next as buttons. Clicking one asks for it exactly as if you had typed it. The row is replaced by the next reply, and disappears as soon as you use one, so you cannot ask the same thing twice by accident. If the model offers nothing, no row appears.

## Read a chart

Charts stack above the conversation. Each carries its own controls and its own caption, and nothing about one chart's controls reaches another.

The caption under a chart says how many rows it is showing — `showing 500 of 12043 rows` when the source had more than it kept — how the measure was reduced, each transformation in the order it was applied, where the data came from, and when it was read.

**Data table**, under each chart, opens the numbers behind that picture: one row per mark the chart draws, with the series column too when the chart is split by one. It also states the chart in a sentence — the kind, the measure, its range, and its largest and smallest mark — which is what a screen reader is given in place of the drawing. Both are built from the same marks, so they cannot disagree with the picture. Neither is part of an exported file.

## Keep a chart current

Each chart has its own **live update** control. Clicking it steps through off, 10s, 30s, 1m and 5m, and its tooltip says both where it is and where the next click goes. A refresh only happens while that tab is open, so nothing is fetched in the background once you close it.

**Read the data now** re-reads that one chart's source immediately, without changing its interval.

When a re-read fails, the reason appears above the conversation and the chart you already had stays on screen. A re-read that succeeds but brings different columns leaves the chart as it was and says why, rather than replacing a working picture with an empty one.

A re-read that changes the data does not change the chart. The chart is what you asked for; asking again is what changes it.

## Export a chart

**Export this chart as PNG** and **Export this chart as PDF** write a file named after that chart, at twice the size it appears in the tab.

## When something goes wrong

- **The address could not be read.** The reason is above the conversation. Paste a different one.
- **The data could not be understood.** The reason says what was wrong with it. Paste a different source, or say what the data should be read as.
- **The model could not reach the data at all.** It says so. A URL to the data itself, rather than to a page describing it, is the thing to try.
- **The model asked for a chart the data cannot show.** The reason is under its reply, and the chart that did work is still there. Ask again in your own words.
- **The model changed a column type wrongly.** Say so — *treat the `total` column as a number* — and it redraws.

## Reopen and delete

Saved visualizations are listed by most recent activity. Click a row twice to open it — the first click selects, the second opens, exactly as the conversation list behaves. You can also open one by name:

```
visualizations Revenue by region
```

Matching ignores case. The words `left` and `right` are reserved for docking.

`visualizations left` and `visualizations right` dock the index in a sidebar. Bare `visualizations` brings it back to the center. See [Tabs](/user-documentation/getting-started/tabs) for shared sidebars.

Deleting asks first, and removes the visualization, its saved data, and its private workspace. A tab that was open for it stays open, saying the visualization was deleted, with its box disabled — close it when you are done with it.
