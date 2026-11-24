# issues

* CI never runs the production build. .github/workflows/ci.yml runs only typecheck, lint, and test in three separate jobs. Nothing exercises npm run build (tsc && vite build), so a broken Vite config, the PDF.js asset plugin in web/vite.config.ts:15, or a missing alias can merge green. Add a build job to CI.

* scripts/run.mjs advertises non-runnable scripts. scripts/run.mjs:17-21 lists every directory entry, so the listing includes e2e, docs-screenshots (twice — directory and .mjs), and release, which would fail if invoked. Filter to files with .mjs/.sh extensions and dedupe.

## ready

## deferred

## declined
