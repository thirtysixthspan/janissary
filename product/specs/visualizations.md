# Visualizations

A visualization is a conversation about data. You name a source, the agent works out how to reach it, asks what you want to see, draws a chart, and then answers whatever you ask next about the data or the chart. Everything that changes a chart is a sentence you type.

### Command grammar

`visualizations` opens or focuses the singleton index, ordered by recent activity. `visualizations left` and `visualizations right` dock that index in the named sidebar. Running bare `visualizations` while the index is docked returns it to the centre.

`visualizations <title>` opens the visualization whose title matches case-insensitively. The docking words take precedence over visualizations titled `left` or `right`. A missing match reports `No visualization matching "<title>".`

### Starting one

The index's plus control opens a tab with nothing in it but a conversation and one line of prompt: **Paste the URL of a data file, or of a page that describes an API, and tell me what you would like to see.** There is no form and no field. What you type is the whole of it, and the tab shows a chart once there is one.

**Visualize this** in the default context menu does the same thing with your current selection as the first message, so selecting an address anywhere in the application is the shortest route there is.

A visualization nobody has started is not a saved one: it is not listed in the index and nothing is written to disk until you say something.

### Naming a source

A source is one `http` or `https` address, or a path to a file, written anywhere in a sentence. The most recent one you name is the one being worked on, so pointing somewhere else part way through is ordinary rather than refused. A bare host is read as `https`, and any other scheme is refused with the reason the application's other web targets give. An address begins where a word begins, so a slash in the middle of one is not an address: "plot revenue/employee by region" is a question, and it is answered as one.

A local file may only be read from the project directory or your home directory, and the check is made on the resolved path — so a `..` traversal, a `~` that expands elsewhere, and a symbolic link pointing out of the tree are all refused, each naming the two directories a source would have to be under. A source anywhere else reports that it is outside them.

The host reads an address with the same bounds it has always used: no credentials of any kind, at most five redirects, fifteen seconds, and a body of at most eight megabytes.

Reading a local file is worth understanding before pointing one at it. The file is read, parsed into a table, and — once the agent is asked about it — a sample of it is sent to whichever model pair the visualization is using. A source naming a credential or a key file therefore exposes that file's contents to a third party. That is the same reach as opening the file yourself and pasting part of it into a prompt, which is not nothing, so the two directories are named above rather than left to be discovered.

### A source that is a page rather than a table

A source may be a page describing an API instead of a file of values, and that is not a failure. What the host fetches is handed to the agent as it stands, and the agent's job is to work out how to reach the data behind it — read the documentation, find the request it describes, add the header or the query parameter the page mentions, follow the pagination, reshape the response — and to write what it fetched into its own workspace as JSON or delimited text with a header row.

The agent runs commands to do this, inside the workspace it is confined to and no further. Its reach is the same reach the host's own read has: the network, and whatever the sandbox profile allows. A file it names for the host to read is resolved through its symlinks and must land inside that workspace, must be a regular file, and is held to the same eight-megabyte ceiling a source is — so a link it creates cannot turn the unsandboxed host into a reader of something the sandbox would have denied it. What is different is that the commands are the model's, and your own message is the only thing that starts them.

A chart naming such a file says so in the line under it, naming the file it came from, so a picture that stopped an hour ago never reads like one that stopped a second ago.

### Asking

The exchange is the interface. The agent asks what it needs to know — which measure, compared against what, grouped how, called what — and you answer in the same box, in your own words. It also draws without asking if the data makes the answer obvious, and it says plainly when it could not get the data rather than inventing a chart.

A rule is something you tell the agent to keep doing, typed into the same box: `remember: always split by service`, and `forget: split by service` to drop it. The colon is required, so a message that happens to begin with the word is asked as a question rather than swallowed. A rule is carried in every later prompt, ahead of the conversation and labelled as yours, and it is listed under the exchange so you can see what is being kept — a rule you cannot see is a rule you cannot check. Forgetting matches on part of a rule rather than the whole of it, and when a rule is dropped the oldest goes first, because the one you have just given is the one you still want. A later message asking for something different wins: you are the user, and you are here now.

Every reply that changed your charts offers to change them back, in one line under the answer, naming what it did — 'Undo — it removed "Revenue by region"'. The host keeps what each turn left as a list of specifications, so taking one back restores the charts rather than asking the model to redo it, and a button is tied to the turn it belongs to: two turns can carry the same sentence, and the second one's button takes back the second one's change. A position the conversation does not hold takes nothing back and says nothing, because a button that quietly did nothing is worse than one that said it could not. A turn that only answered a question offers nothing, because there is nothing to take back. The history reaches back as far as the conversation itself does — forty turns, and the oldest goes — and reverting a turn leaves the ones after it as they are, so a run of changes is taken back one at a time. What a turn keeps is what to draw rather than what was drawn: a chart taken back is resolved again from the data its own specification names, because a record is rewritten on every read and a copy of every chart's rows on every turn is megabytes paid on every read.

Your message is saved the moment it is sent, so stopping a reply with Escape — or closing the tab while the agent is still working — keeps the question in the exchange along with whatever answer had arrived. An answer that never came is shown as an answer that never came; the question is not quietly dropped, because what you typed is the one part of this the agent cannot recover.

The model is shown the values each named column actually holds, so a filter value is a choice rather than a guess — a request for 'New York' against a `state` column is otherwise a coin flip, and eight sample rows cannot say which column was meant. A numeric column is not listed: a measure is read off a chart, and a column of numbers is not a vocabulary. A column with more values than are shown says so, because a list that stops quietly reads as the whole of it.

When the model genuinely cannot choose, it asks: a question and up to four readings it considered, shown above the composer as the suggestion row with the question above it. Clicking a reading sends it as your own words, and the next reply replaces the question, the way it replaces the suggestions.

Every reply may carry two to four requests you could have made next, shown as one-click buttons above the composer. Clicking one sends it as your own words, the row is replaced by the next reply's, and it is gone the moment one is used so the same request cannot be asked twice. A reply that offers none shows no row at all.

A time unit groups a date x column by the calendar: `year`, `quarter`, `month`, `week` or `day`, and it is refused on a column that is not a date. Without one, a date column is one band per distinct value — so a two-year daily series is 730 bands, and `limit` counts days rather than months. The unit is applied before the transformations and rewrites only the x cells: the rows are all kept, so the aggregate you asked for is the aggregate that reduces them. A week begins on Monday, and the axis labels follow the unit rather than printing the ISO date underneath: a month is `Jun`, a year is `2026`, and a year-long chart of months puts the year on its first band because twelve month names with no year on any of them cannot say which year a band is in.

### What you can say

**Change the chart.** Its kind, the columns it plots, the column that splits it into series, how the measure is reduced, its title, and its axis labels. "Make it a line chart", "split by year", "call it Revenue per head", "sum it rather than counting rows."

**Change the data.** Four transformations, applied in order, each one a step you can see in the caption under the chart:

- **filter** — keep only the rows where a column equals, differs from, exceeds, or falls below a value, contains a substring, or is one of several values. The comparison is made in the column's own type: numerically for a number, by instant for a date, against a boolean for a boolean, as text for text.
- **derive** — add a new numeric column computed from an arithmetic expression over the columns already there, using numbers, column names, `+ - * /`, unary minus and parentheses and nothing else. "Revenue per employee", "margin as a share of revenue".
- **sort** — order the rows by one column, in that column's own order, with the source order kept among equal values so the same data always draws the same way.
- **limit** — keep the first *n* **distinct categories of the chart's own x column**, in the order the sort left them. Counted in categories rather than rows so a chart split into series loses a whole bar or line rather than one of a category's series, which would leave a mark a different height from its neighbour with nothing to explain it.

A `sort` followed by a `limit` is a top-N; the reverse is a first-N. A step naming a column the data does not have is refused by name rather than quietly doing nothing, and so is a value that is not of the column's own type — "only twenty-twenty-four" against a numeric column is a mistyped question, not a data set with no such rows. A step that leaves no rows, having asked a question the data does answer, produces an empty chart rather than a failure: "only 2024" against a 2023-only source is a question with an empty answer.

**Add and remove charts.** "Also plot revenue per employee by region" adds a second chart beside the first. Charts are named by what the agent calls them, and a reply can name one to change it and another to change which, so a later request reaches the right chart.

**Rename it.** "Call this Revenue by region" renames the tab, the index entry and the saved record. A name the agent has set is not overwritten by a later chart's title.

### The charts

A chart is a specification, not generated code: a kind (`bar`, `line`, `area`, `scatter`, `pie`), an x column, a y column, an optional series column that splits the marks into one each, an optional aggregate, an optional time unit, a title, and optional axis labels. The specification is checked against the real table before it is shown, so a reply naming a column the data does not have, or a measure that is not a number, or a pie whose category is a number, is refused and reported in the conversation — and one refused chart in a reply of four costs one chart, not the other three.

A measure is a thing you name once and use in every chart after it. A name, the column it means, the reduction over it, and any other words you use for it — `p95 latency` as the 95th percentile of `latency`, also called `p95`. A chart states the name and the host resolves it, so two charts that say `p95 latency` are the same measurement by construction rather than by the model having typed the same column twice. A name is matched without regard to case, a name that is already there is corrected rather than duplicated — so saying that `p95 latency` really means the p99 moves every chart of it — and a chart naming a measure that does not exist, or one whose column this data does not have, is refused by name rather than drawn as something else. A definition whose column the data no longer has stops being offered in the prompt and is otherwise left alone, because you wrote it.

An optional `stack` says how a split chart's series are combined rather than merely split: `zero` draws each series on top of the last so the height of each band is the total, and `normalize` does the same as a share of that total, so the bands read as compositions rather than amounts. Without it the series sit side by side, which is all a bare series column can express. A stack needs a series, and is refused on a pie and on a scatter — a pie has no second dimension and a scatter has no bands — because accepting one there would store a field that does nothing. The caption says which of the two a stack is, because a share read as a total is a chart saying the wrong thing.

An optional aggregate reduces the measure before anything is drawn, within each category and within each series of a category where the chart is split. It is one of `sum`, `mean`, `median`, `percentile`, `variance`, `count`, `distinct`, `min`, and `max`, and leaving it out means every row is its own mark. `percentile` carries its own number from 0 to 100 and is refused without one; it is read by linear interpolation, the way a notebook reads it, so the 95th percentile of ten values is not the largest of them. `median` and `percentile` are the right reduction for a long-tailed measure — a duration, a size, a latency — where an average is dragged by the tail into a number describing no row at all, and `distinct` counts the values a column holds rather than the rows it has. A pie sums when it is left out, because a pie is a share of a whole. `count` counts the rows that would have been drawn, so a row whose measure is not a number is not counted either.

A visualization holds at most eight charts. That is a bound on what it costs to send on every keystroke, not a judgement about how many are useful. Data the agent acquired for a chart is dropped once the last chart reading it goes, however that removal happened: the list of ids to remove is the model's, and one wrong id in it does not keep data nothing is drawing from.

### The tab

The tab has no dropdowns and no controls of its own. Its metadata row is the name, the source as text, and the split control the host draws. The only things you can operate are the charts and the composer, and the only thing that changes a chart is what you type.

Each chart carries its own six controls: read its data now, live update, and export as PNG, PDF, SVG or CSV. They belong to the chart rather than to the tab because they act on it alone, and a reader thinking about a picture thinks about one picture. The SVG is vector, so it stays sharp however far it is scaled and can be edited afterwards; the CSV holds the rows the chart was drawn from — the same rows as the table beneath it, not the source — with a comment naming the chart, its transformations and where the data came from, so a file found on its own three months later still says what produced it. A value holding a comma or a quote is quoted, and one beginning =, + or - is quoted too, because a spreadsheet would read it as a formula and data out of a log is not one.

A chart is also its own text alternative. It names itself for a screen reader and describes its own content — the kind, the measure, the range it spans, and the largest and smallest mark. A disclosure labelled **Data table** holds one row per mark the chart draws, generated from the same marks, so the table cannot disagree with the picture. Neither the description nor the table is part of an export, because an exported picture is not a text alternative.

Each mark carries a spoken name of its own — the category, the measure, the value, and the series where there is one — built from the same numbers it is drawn from, and the axis furniture is hidden from assistive technology. The caption beside the chart is the long description: what it shows, how much of it, what was done to the data and where it came from. A chart is a picture of a table, and the table under it is the alternative that cannot misdescribe it.

The line under a chart says how many rows it is showing, how the measure was reduced, each transformation in the order it was applied, where the data came from, and when it was read. A chart showing five of twelve regions with nothing saying so is a chart lying by omission, and so is one whose bars are totals presented as raw values.

### Export

**Export this chart as PNG** and **Export this chart as PDF** are available on each chart and write a file named after that chart's title. Both rasterize what is on screen at twice its size, so an export matches the tab rather than a redrawing of it. The theme's own page colour is laid down first, because a chart exported transparent looks broken in a viewer, and a theme that declares no background — or a transparent one — falls back to white. A PDF is one page holding one image, deflated where the browser can deflate and uncompressed where it cannot. An export that fails says so in the tab and leaves the chart alone.

### Live update

Each chart has its own interval, offered as a single control that steps through off, ten seconds, thirty seconds, a minute and five minutes, and says in its tooltip both where it is and where a click goes. A refresh happens only while a tab for that visualization is open, so a saved visualization is never fetched behind your back.

A re-read that fails records the reason and leaves the previous table on screen, so a source that stops answering does not also take the chart off the screen. A read that fails outright — thrown rather than answered — is the same thing, and the next interval tries again rather than waiting for a restart. A re-read that changes the data does not change the chart: the specification is yours, and asking is what changes it. A chart whose data the agent acquired is re-asked rather than re-read, because nothing else knows how that data is reached — which is the one case where live update costs a model call, and why the interval is a choice rather than a number.

### What the data is doing

The host checks its own charts' data and says what it finds, above the conversation and in plain sentences: a value outside the fences the middle half of the others occupy, a value outside the band the values before it were within, a series that stepped between two levels, a rate that changed by at least a factor of two. Each finding names the row, the value and the figures the rule used, so a reader can check it; the two time-based rules need an ordered x column, and none of them speaks until there is enough data to be worth speaking about. A row is named by where it is in the table rather than by a position among the values that were kept, so a row the renderer did not draw cannot shift a finding onto the day before, and a row one rule has already named is neither named by another nor counted among the findings this one did not report. A finding is a measurement, not a verdict — a spike may be entirely expected, and it is set apart from the conversation for that reason.

The findings are rebuilt whenever the data changes, so a live update that has come back down stops reporting the spike. They are in the next prompt too, so the agent is answering a question about something already measured rather than being asked to notice it itself; what it makes of a finding is its own, in `notices`, and the two are kept apart because one is a reading and the other is a measurement. Removing a chart removes its finding with it.

### Recovery

A source that will not read, an address refused, a transformation over a column that is not there, a model that answered with something unreadable: each is reported in the conversation and leaves the tab working. Pointing at a different address in a later message is the way back, and the charts you already have are unaffected.

### Deleting

Deleting from the index asks first, and removes the record, its private workspace, and the workspace's trust entry. A tab that was open for it stays open, saying the visualization was deleted, with its composer disabled.

### Storage and the agent

Each visualization is stored in its own directory under the user's Janissary data directory, holding the record, an empty private workspace, and that workspace's private temporary directory. The directory is created on the first read, so a visualization that was never read leaves nothing on disk, and it survives application restarts and project workspace sweeps.

The model is chosen from the catalogued `claude` and `opencode` models, and applies from the first call onward. Every prompt carries the whole state it needs, so a new session behaves exactly as a continuing one and nothing is replayed. The exchange shown is the last twelve turns; the tab shows all of them.

Seatbelt confinement of the agent is best-effort: it applies on macOS while workspace sandboxing is enabled and available. See [[sandbox]] and [[acp]].

### Profiles

Visualization records survive independently of profiles. Restoring a saved visualizations view reopens the index; individual open visualization tabs are not restored, and their saved visualizations remain available from the index.
