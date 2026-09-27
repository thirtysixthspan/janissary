# Give a chart change something to read when the model explains nothing

**Complexity: 2/10** — one pure helper and one branch. The mechanism that dropped the model's own words was fixed in the interviewer test; what remains is only the case where it had none to give.

A revision's note is optional, so a model answering with a bare chart object leaves the turn with an empty response, which renders as an empty bubble under the user's query. The user asked for a change, the chart did change, and the tab says nothing about it.

## Design decision

The fallback is composed from the specification already in hand — the kind, the two columns, and the series column when one is set — rather than invented. A sentence built from what the chart demonstrably is is worth reading; a sentence invented to sound like an explanation is not, and would be worse than the empty bubble it replaces.

The model's own words always win. The fallback applies only when the note is empty, so a model that explains itself is never overwritten, and a model that does not leaves the user with the one fact that is true: what the chart is now.

The closing call's chart gets the same treatment, and this is the case that makes it worth doing rather than tidying. The closing call is the one that produces the chart the user has been answering questions toward, and it currently records no reply at all — the chart appears and the tab says nothing, which is the same gap one step earlier in the flow.

The helper is a plain function in the same module, not a template inside the branch, so it is testable without a session — the same discipline the reply parsers follow.

## Implementation steps

1. Add a `chartSummary(chart)` helper in `src/visualizations/interview.ts` returning a sentence naming the kind, the y column against the x column, and the series column when one is set.
2. In `applyChart`, use `parsed.note` when it is non-empty and the derived summary otherwise, for the turn that was passed in.
3. Give the closing call a turn to write on. The cleanest shape is a single turn added to the record at the start of a closing call, the way `revise` already does, so both paths share one place that writes a reply. Confirm against `VisualizationWindowView` that a turn with no streaming flag is what the view carries, and that adding one on the closing call needs no new wire field.

## Tests

- `src/visualizations/interview.test.ts`: a revision whose reply carries a chart and no note gets the derived summary on its turn; one whose reply carries a note keeps the model's words; the closing call leaves a turn carrying the summary.
- `src/visualizations/manager.test.ts` keeps passing: `answer` drives the closing call, and a turn appearing on the record must not change what the manager's own assertions look at.

## Out of scope

- Changing the wording model, the temperature, or the prompts to encourage notes. That is a different lever for the same gap and would be guessing at a model's behaviour rather than handling its absence.
- Any turn for the opening call. Questions are already the reply there.

## Verification

`./scripts/run.mjs check-diff`, plus: answer the interview through to a chart and confirm the tab carries a line saying what the chart is, then ask for a change and confirm the model's own explanation appears when it gives one.
