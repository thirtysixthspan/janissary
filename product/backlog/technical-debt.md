# technical-debt

## ready

* Pull the command-history recall state machine and caret-insertion logic out of `web/src/CommandInput.tsx` into modules beside it: at 241 lines the component is over the file-size limit and owns rules that have nothing to do with markup — the `histIndex`/`draftBeforeHistory` recall walk (`recallOlder`/`recallNewer`, lines 102-114), the first-line/last-line caret tests that decide whether ArrowUp/ArrowDown recall or move the caret (lines 134-148), and the `execCommand`-with-fallback text splice duplicated between `insertAtCaret` and `insertNewline` (lines 67-81 and 121-130) — which violates §5 (components render, they do not decide; a rule you would want to unit test is in the wrong place). The cost is that none of these can be tested without rendering a textarea and driving key events, and the file has no room left for the next command-bar feature. Extract the recall walk into a `useCommandHistoryRecall` hook, the caret-line predicates into a pure module, and the splice into a shared helper, all in the same directory; the component's props and both exported types are unchanged, so none of its eight importers are affected. Resolve by running the `ai/tasks/hygiene/improve-modularity.md` task against `web/src/CommandInput.tsx`. Severity: **medium**.

## development

## deferred

## declined
