# technical-debt

## ready

* Route the four hand-built `connectionsButton` literals through the `statusButton` helper that already exists: `web/src/InactiveAgentTabBody.tsx:32`, `web/src/AgentTabBody.tsx:110`, `web/src/HarnessTabLayer.tsx:55`, and `web/src/editor/useEditorConnections.ts:29` each construct the same `{ hasContent, onEnter, onLeave, onClick }` object by hand out of a `useStatusWindows` result, while `web/src/status-button.ts` exports `statusButton(hasContent, window)` returning exactly that shape — `InactiveAgentTabBody.tsx` even calls the helper for its `scheduleButton` on the very next prop and then rebuilds the connections one inline. That is §5 (components render; they do not decide): mapping a status window's handlers onto a button's props is data shaping that a pure module already owns. The cost is that adding or renaming a field on `StatusWindowButtonProps` means editing five places instead of one, and three of the four copies are buried in JSX where no test reaches them directly. Replace each literal with a `statusButton(...)` call, keeping `HarnessTabLayer.tsx`'s `scheduleOnly ? undefined :` guard around its call. Four files change and no props, exports, or types move. Severity: **low**.

## development

## deferred

## declined
