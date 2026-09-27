# A recognized date column gets a time axis

## Complexity

5/10 — one new type crosses the wire contract and two guards, a new recognition module decides it, and the mark builder orders by it. Nothing new is drawn and no component changes shape, because a band axis is already what a bar or line chart needs; what was missing was the *order* of the bands and a date a scatter could read as a number.

## Goal

A date column is a character axis today: a month of daily rows is thirty-one evenly spaced categories in whatever order the file happened to list them, so the chart shows no trend and labels that mean nothing. This recognizes an unambiguous ISO 8601 date, gives the column its own type, orders the bands by the instant they name, and lets a scatter read a date as a number so its existing linear x scale can place a point by time.

## Decisions

**1. Recognition is strict, and it is the server's alone.** A column is a date when every value present in it is a calendar date the regex accepts *and* the calendar agrees with: month 1–12, a day within that month for that year, hour under 24, minute and second under 60. This matters because `Date.parse` does not check: it reads `2024-02-31` as the second of March and `2023-02-29` as the first of March, so a pattern alone would type a column of typos as a date and then plot the rollovers. The leap rule is four lines rather than a date library.

**2. Only ISO 8601 is recognized, and everything else stays text.** `2024-6-1` and `06/01/2024` are both unambiguous to `Date.parse` and both ambiguous to a person — the second could be June or March — so neither is a date here. This is the same decision the spec already made, narrowed: before, *no* date was recognized; now exactly one format is, and a column in any other format keeps the behaviour it has today, which is that it is a category.

**3. Recognition decides the type; the client only parses it.** The client never re-decides whether a column is a date, because two implementations of the calendar check would be two answers. It reads the type the server sent and uses `Date.parse`, which is exact for a string the server has already validated. The strict validator therefore exists once, on the server, and the client is two lines.

**4. A date axis stays a band axis, and gains an order.** The tempting change is a linear x scale with real tick steps, and it is wrong for a bar chart: bars need a slot, and a bar drawn at a point on a continuous scale has no width. What actually makes a time series readable is that the slots are in chronological order, so a line rises and falls the way the dates do. Ordering the bands is the whole fix for a bar or line. A scatter is the one kind that already has a linear x, and it gets the date read as an instant for free from that existing scale — which is where "a linear scale with readable tick steps" is true, and only there.

**5. The date type widens the wire union, and two guards follow it.** `VisualizationColumnType` gains `date`, the plugin's payload guard accepts it, and nothing else in validation moves: a measure must be `number`, so a date measure is already refused; a pie's category must not be numeric, so a date is already an acceptable one. `validateChart` needs no change at all, which is the clearest sign the type landed in the right place.

**6. Ordering is stable, and ties keep source order.** Two rows naming the same instant are two marks in the order the file listed them, because an unstable sort would make the same source draw differently on two runs.

## Implementation

1. **`src/visualizations/dates.ts` (new).** `isIsoDate(value)` and `instantOf(value)`: the anchored pattern, the calendar check, and the parsed instant. A comment states why the pattern alone is not enough, naming the two rollover cases, so the calendar check is not "simplified" away later.
2. **`src/protocol/visualizations.ts`.** `date` joins `VisualizationColumnType`.
3. **`src/plugins/visualizations/shared.ts`.** `date` joins the mirrored union and the `COLUMN_TYPES` guard.
4. **`src/visualizations/table.ts`.** `inferType` recognizes a date column, after the number and boolean checks and before the string fallback. The comment that currently says dates are deliberately not inferred is replaced with the narrower truth: ISO 8601 is recognized, and anything else stays text on purpose.
5. **`web/src/plugins/visualizations/chart/points.ts`.** `date` joins the client `Column` union. `marksFor` orders the marks by instant when the x column is a date, by index when it is not, so a stable sort leaves a non-date chart byte-for-byte as it is. `scatterFor` reads a date x as an instant rather than requiring a number.
6. **`web/src/plugins/visualizations/chart/describe.ts`.** A date axis's span reads as the first and last instant in chronological order, which is now what it will be; no change is needed, and this is checked rather than assumed.

## Tests

- **`src/visualizations/table.test.ts`** — an ISO date and an ISO date-time are dates; a leap day is a date in a leap year and a string in a common one; `2024-02-31`, `2024-13-01`, and an hour of 24 are strings; a column of dates with one blank among them is still a date; `2024-6-1` and `06/01/2024` stay strings; a date column with a stray non-date is a string; the numeric and boolean inferences still win where they apply.
- **`src/visualizations/dates.test.ts`** (new) — the calendar boundaries directly, including the two rollover cases, and `instantOf` agreeing with `Date.parse` on a value it accepts.
- **`web/src/plugins/visualizations/chart/points.test.ts`** — a date x orders the bands chronologically whatever order the rows arrived in; two marks sharing an instant keep source order; a string x is untouched; a scatter reads a date x as an instant and refuses a string x; a date y produces no marks, because a date is not a measure.
- **`web/src/plugins/visualizations/chart/describe.test.ts`** — a date axis's sentence spans the first and last date in order.

## Out of scope

- **Any other date format.** Named in decision 2. Adding one is a decision about which of two readings a reader would have meant, not a parser change.
- **A linear time axis for a bar or a line chart.** Named in decision 4. It is the wrong shape for a bar, and a line chart over thirty daily bands reads as well as it would over a linear scale once the bands are in order.
- **Grouping by month, quarter, or year.** Bucketing a time series is a real feature and a separate one; this makes the order right, not the granularity.
- **A timezone for a date-time with no offset.** A naive timestamp is read as the browser's local time, which is what `Date.parse` does and is stated in `dates.ts` rather than guessed at. Choosing a zone is a decision a user would have to make.
- **Formatting tick labels as dates rather than as the source's own text.** The labels stay the source's strings, so a column of `2024-06-01` still reads as that rather than as a locale-formatted date nobody chose.
