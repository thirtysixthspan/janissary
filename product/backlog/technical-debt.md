# technical-debt

## ready

* src/database/query.ts has no colocated test file despite queryDatabase() classifying every incoming query as read-vs-write via the READ_QUERY regex (choosing between database.prepare(query).all() and database.exec(query)) and formatRows() computing column widths and padding for display, both of which have real untested edge cases (a query starting with whitespace or a comment, an empty result set, non-string cell values); add src/database/query.test.ts covering the read/write classification boundary and formatRows()'s zero-row and mixed-type-cell cases. Severity: medium.


* src/monitor/feed-diff.ts has no test file anywhere in the repo despite containing byte-length capping logic that truncates UTF-8 text at a byte boundary (cap()) and stateful diff-vs-full-snapshot logic keyed by a Map with distinct first-call, unchanged, and changed-since-last-call branches (diffFeedEntry()); add src/monitor/feed-diff.test.ts covering the multi-byte truncation boundary in cap() and all three branches of diffFeedEntry(). Severity: medium.

* src/types.ts has grown to 672 lines holding type definitions for roughly 18 unrelated domains (tab, harness, schedule, acp, browser, connections, commands, db, config, completion, logger, and more, each marked off by its own section comment), even though almost every one of those domains already has its own folder under src/ (src/tab/, src/harness/, src/schedule/, src/browser/, src/database/, ...); split each section into a types.ts colocated in its matching domain folder, re-exported from a slim src/types.ts if a single cross-domain import point is still needed, so type definitions live next to the code that owns them like the rest of the codebase. Severity: medium.

## development

* src/tab/manager.ts is 257 non-blank/non-comment lines (313 raw), over the 200-line guideline in ai/guidelines/code-guidelines.md, because TabManager keeps a few full inline operations (notably closeTab and renameTab) that never got extracted the way its other operations already were into sibling files like src/tab/dock.ts, src/tab/reorder.ts, and src/tab/navigation-commands.ts; extract the closeTab and renameTab bodies into new src/tab/*.ts helpers following that same established pattern and call them from TabManager. Severity: high.

## deferred
