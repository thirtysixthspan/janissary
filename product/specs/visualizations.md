# Visualizations

A visualization is one data source plus one chart made from it. The source is a URL or a file the application reads; the chart is drawn from what was read. Pointing at a source, being asked what to look at, and changing the chart afterwards are all done by an ACP-capable model, and the model answers with a chart specification rather than with code.

### Command grammar

`visualizations` opens or focuses the singleton index, ordered by recent activity. `visualizations left` and `visualizations right` dock that index in the named sidebar. Running bare `visualizations` while the index is docked returns it to the centre.

`visualizations <title>` opens the visualization whose title matches case-insensitively. The docking words take precedence over visualizations titled `left` or `right`. A missing match reports `No visualization matching "<title>".`

### Naming a source

A source is one line: an `http` or `https` address, or a path to a file. A bare host is read as `https`, and any other scheme is refused with the reason the application's other web targets give. Two routes reach it, and they exist so that naming a source takes no more typing than pasting one: **Visualize this** in the default context menu takes the current text selection as the source verbatim, and the index's own field takes what is typed into it. Nothing inspects the selection first, so a selection that is not a source is answered by the same refusal a typed one would be.

The source is read by the application, not by the browser, so an arbitrary address works without that address having agreed to be fetched. The read carries no credentials of any kind, follows at most five redirects, gives up after fifteen seconds, and refuses a body over eight megabytes.

A local file may only be read from the project directory or your home directory, and the check is made on the resolved path — so a `..` traversal, a `~` that expands elsewhere, and a symbolic link pointing out of the tree are all refused, each naming the two directories a source would have to be under. A source anywhere else reports that it is outside them.

Reading a local file is worth understanding before pointing one at it. The file is read, parsed into a table, kept in the visualization's saved record, and — once the interview runs — a sample of it is sent to whichever model pair the visualization is using. A source naming a credential or a key file therefore exposes that file's contents to a third party. That is the same reach as opening the file yourself and pasting part of it into a prompt, which is not nothing, so the two directories are named above rather than left to be discovered.

### What a source can be

JSON must be an array of objects, or an object holding one — directly, or one level down, which is the shape `{"data": {"items": [...]}}` takes. Delimited text must be header-led, with the delimiter taken from a tab, comma, semicolon, or pipe. Quoted fields are honoured, a doubled quote inside one is a literal, a missing value is empty, and a short row is padded rather than dropped.

A document that begins like JSON is reported as a JSON failure when it is not valid JSON, rather than reinterpreted as a table. Anything else that will not parse reports the format it looked like and what was wrong with it.

### The table

Column names come from the first object or the header line, trimmed, de-duplicated, and capped. A column is numeric when every non-empty value in it is a number, boolean when every value is one of the two spellings, and text otherwise. Dates are deliberately left as text, so a chart over a date column draws a category axis rather than guessing a format and a timezone.

The application keeps at most 500 rows and 32 columns of what it read, and says so: the tab reports how much of the source it is showing, and whether it is showing the first columns, rather than implying the chart is the whole source. A source with no rows, or with no numeric column to measure, is refused by name.

### The interview

Reading a source is followed by a model call carrying a sample of it: every column with its type, the row count, and the first rows. The model replies with a series of questions about what to look at — which measure, what to compare it against, how to group it, what to call it — and the tab asks them one at a time.

Each question shows the model's suggested answers as one-click buttons, and the field beside them is always available. Clicking a suggestion is two interactions and typing is one, and typing stays possible because the useful answer is often none of the suggestions.

Answering the last question produces the chart. A reply the model could not be read from, or a chart naming a column the data does not have, a measure that is not numeric, or a pie whose category is a number, is refused and reported in the tab rather than stored; the questions and the answers are kept, so **Ask again** retries without redoing any of it.

### The chart

A chart is a kind, an x column, a y column, an optional series column that splits the marks into one each, a title, and optional axis labels. The five kinds are `bar`, `line`, `area`, `scatter`, and `pie`. A row whose measure is not a number is dropped rather than plotted as a zero.

An optional aggregate reduces the measure before anything is drawn, within each category and within each series of a category where the chart is split. It is one of `sum`, `mean`, `count`, `min`, and `max`, and leaving it out means every row is its own mark. A pie sums when it is left out, because a pie is a share of a whole. `count` counts the rows that would have been drawn, so a row whose measure is not a number is not counted either. An aggregate the grammar does not have is refused rather than ignored, because a chart that draws successfully while meaning something other than what was asked for cannot be noticed.

Where a measure is reduced, every place the chart is described says so: the line under the chart names the reduction and the measure, the chart's own description for a screen reader reads as a sum or a mean rather than as a value, and the sentence left behind when the model changes a chart without explaining itself says the same.

The chart's own title names the visualization and its tab, once, and only while the visualization has not been named some other way. Double-clicking the name in the metadata row renames it instead; a committed name is trimmed and capped at 60 characters, and a blank one changes nothing.

### Reading a chart without seeing it

A chart is a picture, so the tab carries what the picture says. The chart names itself for a screen reader and describes its own content: the kind, the measure, the range it spans, and the largest and smallest mark. A description of a chart with nothing to plot says so rather than describing an empty range.

Beneath the chart, a disclosure labelled **Data table** holds one row per mark the chart draws — the category, the measure, and the series when the chart is split by one, for a pie the summed categories, and for a scatter its two numeric columns. It is closed by default, so the tab opens on a chart rather than on a table, and it is generated from the same marks the chart is drawn from, so it cannot disagree with the chart. Neither the description nor the table is part of an export, because an exported picture is not a text alternative.

### Changing the chart

Once a chart exists the tab ends in the same command bar an agent tab does, and behaves the same way. Enter sends the query, Shift+Enter starts a new line, Escape clears an unsent one, and Escape during a reply cancels it. A second query is refused while a reply is in flight, and a refused Enter leaves the typed text in place.

The model is asked for the updated chart and may answer with prose instead, in which case what it said is shown as the reply and the chart is left as it was. When it changes the chart and explains nothing, the tab says what the chart now is instead — the kind, the measure against the category, and the column it is split by — so a change never lands silently. The exchange stays in the tab, oldest first, and follows new output to the bottom until the user scrolls away.

The answers given to the interview are recorded as the first turn, and the chart the interview produced is its reply, so the reasoning behind a chart is readable after the fact rather than only at the moment it was given.

The reply is rendered as sanitized Markdown, the same as any other model reply in the application. Only the reply text is shown; whatever reasoning the model did is not.

### Export

**Export as PNG** and **Export as PDF** are available once there is a chart, and write a file named after the chart's title. Both rasterize what is on screen at twice its size, so an export matches the tab rather than a redrawing of it. The page colour is laid down first, because a chart exported transparent looks broken in a viewer. A PDF is one page holding one image, deflated where the browser can deflate and uncompressed where it cannot.

An export that fails says so in the tab and leaves the chart alone.

### Staying current

A visualization is read once and then left alone. The refresh control offers off, ten seconds, thirty seconds, a minute, and five minutes, and **Read the source now** re-reads on demand without changing the interval. A refresh happens only while a tab for that visualization is open, so a saved visualization is never fetched behind the user's back, and a re-read never overlaps one already in flight.

A re-read that fails records the reason and leaves the previous table on screen, so a source that stops answering does not also take the chart off the screen. The tab reports when the data was last read. A re-read that changes the data does not change the chart: the specification is the user's, and asking for a different one is what changes it.

### Recovery

While there is no chart, the source can be replaced. That discards the interview and every answer in it, so it is confirmed first, and the previous source stays until a replacement is given. Once a chart exists the source cannot be replaced, because every answer the user gave was given about the old data; the control is not shown then, rather than shown and refused.

A model that asked nothing leaves a visualization with a source and no questions, which says so and offers **Ask again**.

### Deleting

Deleting from the index asks first, and removes the record, its private workspace, and the workspace's trust entry. A tab that was open for it stays open, saying the visualization was deleted, with every control on it disabled.

### Storage and the agent

Each visualization is stored in its own directory under the user's Janissary data directory, holding the record, an empty private workspace, and that workspace's private temporary directory. The directory is created on the first read, so a visualization that was never read leaves nothing on disk, and it survives application restarts and project workspace sweeps.

The model is tool-less and runs in that workspace, so it receives neither the project tree nor another visualization's data. Seatbelt confinement is best-effort: it applies on macOS while workspace sandboxing is enabled and available. See [[sandbox]] and [[acp]].

The model is chosen from the catalogued `claude` and `opencode` models in the metadata row, grouped by harness, and applies from the next call onward. Changing it ends the current session. Unlike a conversation, every prompt carries the whole state it needs, so a new session behaves exactly as a continuing one and nothing is replayed.

### Profiles

Visualization records survive independently of profiles. Restoring a saved visualizations view reopens the index; individual open visualization tabs are not restored, and their saved visualizations remain available from the index.
