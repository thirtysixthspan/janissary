# issues

* scripts/run.mjs advertises non-runnable scripts. scripts/run.mjs:17-21 lists every directory entry, so the listing includes e2e, docs-screenshots (twice — directory and .mjs), and release, which would fail if invoked. Filter to files with .mjs/.sh extensions and dedupe.

## ready

## deferred

## declined
