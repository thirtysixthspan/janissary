<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Carry a refused address to the model beside the data it already has, rather than in place of it. Severity: 6/10

Existing Issue: `chatPrompt` in `src/visualizations/prompts.ts` substitutes `context.sourceNote` for the whole datasets section, and `addressIn` in `src/visualizations/source.ts` matches any run beginning with a slash — so a message like "plot revenue/employee by region" yields the address `revenue/employee`, `parseSource` refuses it, and the prompt's entire data section becomes the refusal. Severity: 6/10

Existing Risk: 6/10 - The model is shown no columns, no row count and no sample for the source the user named one message earlier, so it cannot draw anything and says so; the user is told their question could not be answered for a reason that has nothing to do with their question, and the fix — saying "revenue per employee" instead — is not discoverable from the message.

Proposal Risk: 2/10 - The refusal still reaches the model before the next reply, so the same recovery advice is delivered; what changes is that the data stays in the prompt beside it.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1440: keep the data in the prompt when an address in the message is refused". In `src/visualizations/prompts.ts`, render the note as a line above the datasets rather than as a replacement for them, so `## The data` always carries what is actually held. Then tighten `addressIn` in `src/visualizations/source.ts` so a bare slash run is only read as a path when it begins at the start of a word rather than in the middle of one, which is what `revenue/employee` is; a sentence still containing a genuine path is unaffected. Add a case to `src/visualizations/prompts.test.ts` asserting the datasets survive a source note — the existing `'says a note for the model about the source, in place of the datasets'` case pins the behaviour being changed and should be replaced — and a case to a new `src/visualizations/source.test.ts` or the existing one if there is one, asserting that `addressIn` does not return `revenue/employee` from that sentence and does return a real path from one.

* Give the transformation vocabulary a total row count, so a capped source is reported as capped under a chart. Severity: 6/10

Existing Issue: `resolve` in `src/visualizations/chart-spec.ts` sets `total: applied.table.rows.length` on the resolved table, so `total` can never differ from `rows.length`, and `caption` in `web/src/plugins/visualizations/VisualizationChartCard.tsx` — the only consumer of the field — can therefore only ever read "5 rows" or "showing 5 of 5 rows". Severity: 6/10

Existing Risk: 6/10 - A chart over a source of twelve thousand rows silently shows five hundred of them and says "500 rows", which is precisely the omission `product/specs/visualizations.md` calls a chart lying by omission; a reader has no way to tell a complete picture from a cropped one.

Proposal Risk: 2/10 - The two numbers are now genuinely different, which is what the caption was written for; the transformations still report their own row count honestly.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1440: report how much of a capped source a chart is showing". In `src/visualizations/chart-spec.ts`, have `resolve` carry the source's true row count through rather than replacing it with the transformed count: keep `total` as the number of rows the source held and let `rows.length` be what the transformations left, so `truncated` and a `total` above `rows.length` are reachable together. Confirm against `src/visualizations/table.ts`'s `TableResult`, whose `total` and `truncated` are already the source's own figures, and against the transform pipeline in `src/visualizations/transforms.ts`, which has no notion of the pre-transform count. Add a case to `src/visualizations/chart-spec.test.ts` asserting that resolving a truncated source yields a table whose `total` is the source's count and whose `truncated` is true, and a case to `web/src/plugins/visualizations/VisualizationChartCard.test.tsx` asserting the caption reads `showing 500 of 12043 rows` for a chart over a truncated source. Correct the sentence in `product/specs/visualizations.md` under "The tab" that describes what the caption says, if its wording changes.

* Refuse a filter value that is not the column's own type, rather than coercing it into a silent empty chart. Severity: 6/10

Existing Issue: `typed` in `src/visualizations/transforms.ts` coerces with `Number(cell)` for a numeric column, and `isFilterStep` in `src/visualizations/chart-spec.ts` accepts any string as a filter value, so `"twenty-twenty-four"` becomes `NaN` and fails every comparison; a `contains` step with no value at all is likewise accepted and matches every row. Severity: 6/10

Existing Risk: 6/10 - A model that misreads a value's type produces a chart with no marks and no reason anywhere on screen, and both the spec and `transforms.ts`'s own comment call that state "a question with an empty answer" — so the failure is indistinguishable from a legitimate one, and the user is left asking why their filter returned nothing.

Proposal Risk: 2/10 - A correctly-typed value is unaffected, and a numeric string is still accepted, because a CSV produces those and the plan says so; what goes is the value that matches nothing at all.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1440: refuse a filter value that is not the column's own type". In `src/visualizations/transforms.ts`, make `typed` return nothing for a numeric cell that is a string `Number` cannot read as a finite number, the way it already returns nothing for a date the calendar disagrees with, and have `filterStep` report a named refusal when a value could not be read in the column's type rather than matching nothing. Require a value for every comparison including `contains`, in the grammar's guard in `src/visualizations/chart-spec.ts` as well as in the applier, so a step with no value never reaches the table. Add cases to `src/visualizations/transforms.test.ts` for a non-numeric string against a numeric column, for a `contains` with no value, and for a numeric string that is accepted; and a case to `src/visualizations/chart-spec.test.ts` asserting the grammar refuses a step with no value.

* Persist the turn when a message is accepted, so closing the tab mid-reply does not delete what the user typed. Severity: 6/10

Existing Issue: `agent.start` in `src/visualizations/agent.ts` pushes the turn onto the record and calls only `changed()`, never `commit`, so the turn first reaches disk through the source read's commit or the reply's; `releaseClosed` in `src/visualizations/manager.ts` then clears the streaming flag in memory, commits nothing and calls `index.release(id)`, dropping the record. Severity: 6/10

Existing Risk: 6/10 - Closing a tab while a reply is in flight removes the user's own message from the exchange permanently, and the plan states the opposite — "the record and its turns survive, so reopening resumes" — so this is a plan promise the code does not keep.

Proposal Risk: 2/10 - One extra write per message, which is the same write the read already makes; the streaming flag on the persisted turn is what the record guard already accepts.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1440: persist a message as soon as it is accepted". In `src/visualizations/agent.ts`, have `start` commit the record once the turn has been pushed, before the call goes out, and have `VisualizationsManager.cancel` commit after clearing the streaming flag so the cleared state reaches disk too. Confirm against `src/visualizations/store.ts`'s `isTurn`, which already accepts a persisted streaming turn, and against the payload finding in this same backlog, which is what makes that acceptance load-bearing. Add a case to `src/visualizations/manager.test.ts` that sends a message, closes the tab without a reply, reopens it, and asserts the query is still in the exchange; the existing `'disposes without removing anything from disk'` case is the pattern to follow.

* Clear the suggestion row when one of its suggestions is used, rather than when the reply that replaces it lands. Severity: 5/10

Existing Issue: `agent.apply` in `src/visualizations/agent.ts` replaces `record.followUps` only when a reply arrives, and `agent.fail` leaves them in place, so the row the specification says is "gone the moment one is used" survives both a use and a failure. Severity: 5/10

Existing Risk: 5/10 - The same two-to-four requests can be clicked through repeatedly, each costing a model call and producing an identical chart, and a failed reply leaves the user offered the requests that led to the failure as though they had not been tried — while the tab's own comment claims the buttons are hidden while a reply is in flight, which depends on the `busy` flag the payload finding above prevents the client from ever seeing.

Proposal Risk: 2/10 - The row is replaced by the next reply as before, so nothing is lost; it simply cannot be used twice, which is what the specification promises.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1440: clear the suggestion row when one of its suggestions is used". In `src/visualizations/agent.ts`, delete `record.followUps` in `start` before the call goes out — the turn is already on the record, and the row is the model's last set of requests, which the exchange now shows as asked — and commit that with the turn so both land together. Leave the replacement on the reply as it is. Add a case to `src/visualizations/agent.test.ts` that asks with a row present, asserts the row is gone before the reply arrives, and asserts the reply's own row replaces it; the existing `'sends a suggestion as the user's own words'` case in `web/src/plugins/visualizations/VisualizationTab.test.tsx` and the payload finding above are the two things that make this observable.

* Give the composer's history recall the turn queries it is documented as reusing. Severity: 4/10

Existing Issue: `VisualizationChat.tsx` passes `history: []` to `useCommandBarKeys`, so `useCommandHistoryRecall` returns immediately and the Up arrow recalls nothing, while the component's own comment and the plan's reuse table both claim the same history recall an agent tab's composer has. Severity: 4/10

Existing Risk: 4/10 - A user who has asked the same visualization several things cannot recall an earlier request with the Up arrow, and will retype it — the one affordance a terminal-shaped composer is expected to have.

Proposal Risk: 1/10 - One array of strings derived from turns already on the record; the recall behaves exactly as it does in a conversation tab.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1440: give the composer's history recall the turn queries". In `web/src/plugins/visualizations/VisualizationChat.tsx`, derive the history from the turns the component already receives — each turn's `query`, oldest first, skipping the empty ones a live-update turn carries — and pass it to `useCommandBarKeys` in place of the empty array. Add a case to `web/src/plugins/visualizations/VisualizationTab.test.tsx` asserting that the Up arrow in the composer recalls the last query sent, following the pattern the conversations composer test uses.

* Drop the dead `source` field and the unreachable `turn.error` branch the rewrite left behind. Severity: 4/10

Existing Issue: `CreateIntent` in `src/plugins/visualizations/shared.ts` carries an optional `source` that `activate.ts` drops on the floor and no caller sends, and `VisualizationTurnView.error` is declared, re-declared, guarded in two places and rendered by a branch in `VisualizationChat.tsx` that nothing ever writes to. Severity: 4/10

Existing Risk: 3/10 - A reader looking for where a turn failure is recorded finds a field that is never set and a render branch that can never run, and concludes the failure path is handled somewhere it is not — which is the same conclusion that makes the streaming-flag mismatch in `store.ts` so easy to miss.

Proposal Risk: 1/10 - Two dead declarations removed; nothing that compiles or runs today depends on either.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1440: drop the dead source field and the unreachable turn-error branch". Remove `source` from `CreateIntent` and from `isCreateIntent` in `src/plugins/visualizations/shared.ts`, and confirm with a grep across `src/plugins/visualizations/` and `web/src/plugins/visualizations/` that nothing sends it. Remove `error` from `VisualizationTurnView` in `src/protocol/visualizations.ts` and from `VisualizationTurn` in `src/plugins/visualizations/shared.ts`, remove the two guard clauses that test it, and simplify the `turn.error` branch in `web/src/plugins/visualizations/VisualizationChat.tsx` to render the response alone — `agent.fail` already writes a readable line into `turn.response`. Update `src/visualizations/store.test.ts` and `src/plugins/visualizations/shared.test.ts` where they exercise the field. If the decision is instead to keep the field and write it, say so in the entry rather than deleting it; what must not ship is a declared field nothing ever sets.
