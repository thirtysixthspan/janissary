# technical-debt

## ready

* Stop passing the protocol client into the transcript's presentational renderers in `web/src/transcript-line.tsx`: `OpenFileLink`, `renderMessageTab`, `renderMarkdownLine`, and `renderTextContent` all take a `client: JanusClient` prop and issue protocol calls straight from JSX handlers — a `client.send` of an `edit <path>` command at line 101, a `FILE_LINE_LINK`-driven choice between `edit` and `open` at line 115, and `{ method: 'focusTab' }` at line 159 — which violates §5 (a presentational component takes the data it renders and the callbacks it invokes, never a service instance) and §8 (a component reaching past its hook into a service). The cost is that the command-string rules are untestable without a fake client and unreachable from anywhere else, and every new transcript line type adds another inline protocol call. Replace the `client` parameter on `renderLine` with an intent object (`{ onOpenFile, onEditFile, onFocusTab }`) built once in `Transcript.tsx` from a hook, and move the `edit`/`open` decision into a pure module beside it. Two files reference `renderLine` — `Transcript.tsx` and its test — but `TerminalCard` still needs the client, so plan that hand-off as part of the change. Severity: **medium**.

* Pull the command-history recall state machine and caret-insertion logic out of `web/src/CommandInput.tsx` into modules beside it: at 241 lines the component is over the file-size limit and owns rules that have nothing to do with markup — the `histIndex`/`draftBeforeHistory` recall walk (`recallOlder`/`recallNewer`, lines 102-114), the first-line/last-line caret tests that decide whether ArrowUp/ArrowDown recall or move the caret (lines 134-148), and the `execCommand`-with-fallback text splice duplicated between `insertAtCaret` and `insertNewline` (lines 67-81 and 121-130) — which violates §5 (components render, they do not decide; a rule you would want to unit test is in the wrong place). The cost is that none of these can be tested without rendering a textarea and driving key events, and the file has no room left for the next command-bar feature. Extract the recall walk into a `useCommandHistoryRecall` hook, the caret-line predicates into a pure module, and the splice into a shared helper, all in the same directory; the component's props and both exported types are unchanged, so none of its eight importers are affected. Resolve by running the `ai/tasks/hygiene/improve-modularity.md` task against `web/src/CommandInput.tsx`. Severity: **medium**.

## development

## deferred

## declined
