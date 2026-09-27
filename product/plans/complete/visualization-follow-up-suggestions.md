# Follow-up suggestions, once there is a chart to ask about

## Complexity

4/10 — one optional field crosses the wire contract and three guards, the model is asked for it in two prompts, and the client renders a row of buttons it already has the markup and styling for. No new component, no new shape, and no behaviour on a chart nobody has suggested anything about.

## Goal

The suggestions stop at exactly the moment they start to matter. The interview offers one-click answers because most questions get answered by clicking one, and then the chart appears and the tab offers nothing but a bare command bar — so someone staring at a chart they did not choose has to invent the follow-up themselves, which is the hesitation the interview existed to remove. This keeps the same offer alive after the chart.

## Decisions

**1. The model returns follow-ups beside the note it already returns, not as a new reply kind.** A chart reply already carries prose explaining what it did. Follow-ups belong to the same reply because they are about the same chart, and adding a fourth `Reply` variant would mean a model asked for one shape answering with another. `parseChart` grows a field rather than a branch.

**2. The row is cleared the moment one is used, on the server.** The suggestions live on the record, and `revise` drops them before the call goes out. That is what stops a stale suggestion being clicked twice and sending the same query again, and it means the row cannot grow: each reply replaces the set rather than adding to it. Clearing it in the client instead would leave the record still offering them after a tab reload.

**3. The shape and the markup are reused rather than reinvented.** `VisualizationQuestion` already renders suggested answers as a row of pill buttons with a refusal that reads as ordinary, and `parseQuestions` already trims and caps a list of short strings. The chat renders the same two class names and the same cap; it does not get a component of its own, because a row of suggestions is a row of suggestions and a second implementation is a second thing to keep in step.

**4. The cap is the interview's, and the floor is one.** Two to four is the range the model is asked for. A cap of four is the same `MAX_SUGGESTIONS` the interview uses, so the longest row a user can meet is the same length in both places; a single suggestion reads as a default rather than as a choice, and a row of one is not an offer.

**5. The revision prompt carries the current follow-ups so the model can replace them.** Without it, every reply proposes from scratch and the same question comes back after a change that made it moot. Passing the existing set lets the model see what it already suggested, which is the only thing that distinguishes a follow-up from a repetition.

**6. Suggestions are hidden while a reply is in flight, and the typed field is untouched.** A button that does nothing while the model works is worse than no button, and the command bar's own refusal already leaves typed text in place — the row has to behave the same way.

**7. A chart with no suggestions shows no row.** An empty row of nothing is a gap in the layout, and "no follow-ups" is not information a user needs stated.

## Implementation

1. **`src/protocol/visualizations.ts`** and **`src/plugins/visualizations/shared.ts`.** An optional `followUps: string[]` on the window, mirrored, and accepted by the payload guard as an array of strings — the same shape the questions guard already checks.
2. **`src/visualizations/store.ts`.** The field on the record and in its `isRecord` guard, so a persisted record with a malformed list is refused at read time rather than rendered as buttons with nothing to press.
3. **`src/visualizations/prompts.ts`.** `parseChart` reads `followUps` alongside `note`, trimmed and capped. `chartPrompt` asks for them, since the first chart is where the offer starts. `revisionPrompt` takes the current set and asks for a replacement.
4. **`src/visualizations/interview.ts`.** `applyChart` stores them, and `revise` clears them before the call goes out.
5. **`src/visualizations/view.ts`.** Carry them into the window payload.
6. **`web/src/plugins/visualizations/VisualizationChat.tsx`.** Take `followUps` and render the reused row above the command bar, each button sending its own text as the query.

## Tests

- **`src/visualizations/prompts.test.ts`** — a reply carrying follow-ups parses them; a reply without them yields an absent field rather than an empty list; an empty or blank entry is dropped; the list is capped at four; the revision prompt carries the current set and asks for a replacement.
- **`src/visualizations/interview.test.ts`** — a chart reply stores its follow-ups; `revise` clears them before the call; a chart reply with none leaves the field absent.
- **`web/src/plugins/visualizations/VisualizationTab.test.tsx`** — the row appears after a chart and not before; clicking one emits a `revise` with its own text; a chart with no follow-ups shows no row.

## Out of scope

- **A follow-up that is a question rather than a change.** Every button sends a modification, because that is what the chat does; a button that asked a question would need a second path through the same call and is a different feature.
- **Suggestions that survive a re-read.** A source read twice can suggest something the new data no longer supports, and the chart's own reply is what replaces them.
- **The model choosing when to stop offering.** There is no cap on how many times a visualization may be asked for follow-ups; there is a cap on how many are shown at once, and the row is replaced each time.
- **Ordering the suggestions, or scoring them.** The model's order is the model's order, and ranking them is a different question.
