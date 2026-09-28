# Give the composer's history recall the turn queries, and drop two dead fields

Two small things the rewrite left behind, both of the same kind: a declaration that says the tab can do something it cannot, or holds state nothing ever writes.

**History recall.** `VisualizationChat.tsx` passed `history: []` to `useCommandBarKeys`, so `useCommandHistoryRecall` returned immediately and ArrowUp recalled nothing — while the component's own comment claimed "the same history recall" an agent tab's composer has, and the plan's reuse table said so too. It now derives the history from the turns the component already receives: each `query`, oldest first, which is the order the conversations composer passes and the order the recall hook walks backwards through. A live-update turn carries no query of its own and is filtered out, because recalling an empty string looks broken rather than like nothing being there.

**Two dead fields.** `CreateIntent.source` was declared and accepted by `isCreateIntent`, dropped on the floor by `activate.ts`, and sent by nobody. `VisualizationTurnView.error` was declared, re-declared in the plugin's shared contract, guarded in both guards, and rendered by a branch in `VisualizationChat.tsx` that nothing ever wrote to — `agent.fail` writes a readable line into `turn.response` instead. A reader looking for where a turn failure is recorded would find a field that is never set and a render branch that cannot run, and conclude the failure path is handled somewhere it is not.

So: `error` comes off `VisualizationTurnView`, off `VisualizationTurn`, and out of both `isTurn` guards; the render branch collapses to the response alone, and `.visualization-chat-error` goes with it. `source` comes off `CreateIntent` and out of `isCreateIntent`. The record's own `error`, the window's, the dataset's and the chart's are all written and all kept — this is only the two that never were.

`web/src/plugins/visualizations/VisualizationTab.test.tsx` gains a case walking ArrowUp back through two queries with a query-less turn in between.
