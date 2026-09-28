<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

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
