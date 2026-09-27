# Test the visualization interviewer

**Complexity: 3/10** — one new test file against a module that already accepts every collaborator it needs as a parameter, plus the two production fixes the test itself turned up. The no-production-change expectation below was wrong, and the section after it says so.

`src/visualizations/interview.ts` is the module that decides what a model's reply is allowed to change: whether questions are stored, whether a chart is stored, whether the reply is kept as text, and whether a failure is recorded. It is the riskiest logic in the feature and it has no test of its own — the manager's tests reach it only through a path that never completes a call. The plan names this file.

## What the test found

The plan expected to add tests and nothing else. Two of the first cases failed, and both were real:

**A refused chart's reason was cleared the moment it was recorded.** `applyChart` committed with the refusal reason and returned false, and its caller then committed again with no reason — which clears the one just set. The closing call has no turn to explain itself on, so a chart the model could not legitimately produce left the tab showing neither a chart nor a failure. `applyChart` now commits exactly once per outcome, including for a reply that parses as no chart at all, and its caller no longer commits on the refusal path.

**The model's own words never reached the turn.** The caller cleared the turn's `streaming` flag and then `applyChart` searched the record for the turn still carrying it, so the search found nothing and the note was dropped. That is the mechanism behind the separate recorded finding about a modification turn having nothing to read. The turn is now passed into `applyChart` rather than looked up.

Both fixes are in `src/visualizations/interview.ts`, and both are what the plan's own test list was written to catch, which is the argument for having written it.

## Design decision

Drive `VisualizationInterviewer` directly with a stubbed `AcpSessionPool`, a fake `commit`, and a real record, rather than going through the manager. Every collaborator is already a constructor parameter, so the test needs no new seam and the production module does not change.

The stub records the prompt it was given and hands back a session whose `prompt` the test completes on demand, which is what lets a test decide when a chunk arrives, when the call ends, and when it fails.

The plan's wording that chunks "coalesce into bounded ticks" describes a coalescing tick the implementation deliberately dropped: a partial JSON reply is half an object, and the module says so in its own comment. The test records the accumulator as it is — text arriving in several chunks is all of it before the call completes — rather than testing for a tick that does not exist.

## Implementation steps

1. Add `src/visualizations/interview.test.ts` with a fake pool, a fake session whose `prompt` captures its handlers, a `commit` that records the record and the error it was given, and a `workspace` hook that returns a fixed directory.
2. Build a record helper mirroring the one in `src/visualizations/store.test.ts`, carrying a small table and no chart.
3. Cover the cases the plan lists, in the plan's order.
4. Apply the two fixes recorded above to `src/visualizations/interview.ts`, in the order the failing cases surfaced them.

## Tests

- `open` with a reply carrying questions stores them, commits with no error, and puts no chart on the record.
- `close` with a reply carrying a valid chart stores it, and an untitled record takes the chart's title while a record the user named keeps its own.
- `open` with a reply carrying no readable questions commits with the unreadable reason and stores nothing.
- `close` with a reply whose chart names a column the table lacks stores no chart and commits with the refusal reason.
- `close` with a reply that parses as no chart at all commits with the unreadable reason.
- A second call while one is in flight is refused for `open`, `close`, and `revise`.
- `cancel` drops the in-flight entry and returns true; it returns false when nothing is in flight; a revision's streaming turn is gone from the record afterwards.
- An `onError` from the session commits a rate-limited reason through `isRateLimitError` and closes the session.
- A `revise` pushes a streaming turn before the call, and on completion replaces it with the parsed note, keeping the turn on the record.
- Text arriving in three chunks before the call completes is all of it.
- `dispose` empties the in-flight set and disposes the pool.

## Out of scope

- The derived fallback for an empty note. It is a separate recorded entry, and the mechanism behind it is fixed here; the remaining work is only the wording, which is better decided on its own.
- Any other change to `interview.ts` beyond the two fixes above. The test needed no new seam, which is the point of the collaborators already being parameters.

## Verification

`./scripts/run.mjs check-diff`.
