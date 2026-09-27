# The schema, shown and correctable before the interview asks anything

## Complexity

6/10 — a new gate in the interview's state machine, two new topic actions, a new client region, and a type correction that has to reach the sample the model reads as well as the table the chart is drawn from. Nothing existing changes behaviour, but the moment the interview starts moves, which is the part worth getting right.

## Goal

Column types are worked out for the user and never shown to them. A column of numbers written with thousands separators or a currency symbol is inferred as text, the model is told it is text, and the entire interview is built on a type nobody saw and could have corrected. This shows the schema the moment a source is read, lets a type be corrected, and starts the interview only afterwards.

## Decisions

**1. The interview starts on a confirmation, not on the read.** Today a successful read calls the interviewer immediately, and the tab goes from "Reading the source…" straight to the model's first question. A confirmation between the two is the whole point: a correction that arrives after the first question is a correction to a conversation already built on the wrong type. So a successful read no longer opens the interview; it opens a review.

**2. A re-read does not re-open the review, unless the schema actually changed.** A refresh interval that re-asked for a confirmation every tick would make the feature unusable, so a re-read that produces the same columns and types leaves the review closed. One that produces a different schema — a column renamed, a type re-inferred from new rows — re-opens it, because the thing the user confirmed is no longer the thing on screen. Comparing the column list is the test, and it is a comparison of what was confirmed rather than of when.

**3. A correction rewrites the type, not the cells.** The client already reads a numeric string as a number, and the model's sample is built from the declared column types, so changing a column's declared type is enough for both the chart and the interview to see a measure. Rewriting the cells would be a second, lossy representation of the same decision, and would make a column the user corrected indistinguishable from one the parser inferred.

**4. Corrections are refused once the review is closed.** A type change after the interview has begun would invalidate questions already answered against the old schema, and there is no honest way to un-ask them. The refusal is a refusal, not a silent no-op, because a control that only sometimes works is worse than one that is honestly unavailable.

**5. The four types are the four the parser can infer.** Offering a fifth — a currency, a percentage, a duration — would be offering a type nothing downstream understands, since the renderer and the model both branch on number, boolean, date, and text. A column of currency stays text until the user says it is a number, which is the correction that actually helps.

**6. The review is a region, not a step in the interview.** It has no question, no suggestions, and no answers, so it belongs beside the pending and empty states rather than inside `VisualizationQuestion`. It is closed by a button that says what it does — "Ask about this data" — rather than by an implied next.

## Implementation

1. **`src/visualizations/store.ts`.** A `reviewed` flag on the record, false when a record is created and when its source changes, and accepted by the record guard.
2. **`src/protocol/visualizations.ts`** and **`src/plugins/visualizations/shared.ts`.** `reviewed` on the window, mirrored and guarded, so a tab can tell a review that is open from an interview that is about to start.
3. **`src/visualizations/manager.ts`.** `readSource` stops opening the interview and instead compares the incoming schema with the one the user confirmed. Two new methods: `setColumnType`, which rewrites a declared type and is refused once the review is closed, and `confirmSchema`, which marks the review closed and opens the interview. `setSource` clears the flag.
4. **`src/plugins/api-topics.ts`** and **`src/plugins/topics.ts`**. The two actions, `setColumnType` and `confirmSchema`, wired to the manager beside the ones already there.
5. **`web/src/plugins/visualizations/SchemaReview.tsx` (new).** The region: every column with its name and inferred type, a select per column, and the button that starts the interview.
6. **`web/src/plugins/visualizations/VisualizationBody.tsx`.** The review is offered in place of the pending message whenever a table has been read, nothing has been asked, and the review is open — before the question branch, because a question cannot exist until the review is closed.
7. **`web/src/plugins/visualizations/VisualizationTab.tsx`.** The two intents, emitted by the new region.

## Tests

- **`src/visualizations/manager.test.ts`** — a read leaves the review open and asks nothing; confirming opens the interview; a correction is refused after confirmation and accepted before it; a correction rewrites the declared type and leaves the cells alone; a re-read with the same schema leaves the review closed; a re-read whose schema changed re-opens it; changing the source re-opens it.
- **`web/src/plugins/visualizations/VisualizationTab.test.tsx`** — the review is offered instead of the pending message once a table is read; a correction emits `setColumnType`; the button emits `confirmSchema`; the review is not offered again once questions exist, once a chart exists, or while the review is closed.

## Out of scope

- **Renaming a column, or dropping one.** Both change what the model is asked about far more than a type does, and neither is a correction to a misreading.
- **Re-opening the review once a chart exists.** The chart names the columns it used, and changing a type afterwards would mean redrawing a chart against a schema the user has already been shown.
- **The model confirming the types too.** It is asked which measure to plot, and a wrong declared type is corrected here rather than argued over in the interview.
- **A per-column sample of the values the type was read from.** Showing `1,234` beside a type the parser called text is the clearest possible evidence, and it is a second column in the same region rather than a new feature; it is left out only to keep the region to one decision per column.
