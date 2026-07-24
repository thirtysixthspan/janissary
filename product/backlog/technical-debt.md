# technical-debt

## ready

## development

* src/tab/manager.ts is 257 non-blank/non-comment lines (313 raw), over the 200-line guideline in ai/guidelines/code-guidelines.md, because TabManager keeps a few full inline operations (notably closeTab and renameTab) that never got extracted the way its other operations already were into sibling files like src/tab/dock.ts, src/tab/reorder.ts, and src/tab/navigation-commands.ts; extract the closeTab and renameTab bodies into new src/tab/*.ts helpers following that same established pattern and call them from TabManager. Severity: high.

## deferred
