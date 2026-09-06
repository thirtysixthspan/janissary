# Documentation screenshots

### Capture

`./scripts/run.mjs docs-screenshots` regenerates the screenshots the pages under `documentation/user-documentation/` reference. Passing shot names captures only those; passing a name no entry declares fails with `No manifest entries match: <names>`. Each shot is declared once in `scripts/docs-screenshots/manifest.mjs`, and the entry's name is its output filename, so a page's `/screenshots/<name>.png` path stays stable across reruns. The homepage hero, `demo.png`, is not a manifest shot and is never regenerated.

Every shot gets its own scratch directory and its own app process, so a capture depends on nothing an earlier one did. The scratch directory is seeded from the fixtures, made into a git repository with a local `origin` so workspaced shots can clone, and given a `home` directory of its own so the app's homedir-scoped state never reads or pollutes the real one. A fixture web server supplies the page the embedded-web-page and browser shots point at, in place of a real site that could change or go down.

Captures show the built web UI, not a dev server, so the bundle has to exist first. A run with no `web/dist/index.html` stops:

```
Web bundle missing — run `npm run build:web` first (screenshots capture the built UI).
```

### Which browser a run drives

A run drives the browser janissary attached to its tab when both `JANISSARY_BROWSER_WS_ENDPOINT` and `JANISSARY_PLAYWRIGHT` are set — the pair a harness tab launched with `-b` carries (see [[harness]] and [[sandbox]]). It connects to that endpoint using the Playwright client the second variable names rather than the project's own, since client and server must be the same build to connect at all. The first connect is retried once, because the endpoint is published before the browser has finished starting.

With either variable unset, the run launches its own Chromium instead, and stops when there is none to launch:

```
Playwright Chromium is not installed — run `npm run playwright:install-chromium` first.
```

That is what a sandboxed workspace without an attached browser hits: the sandbox denies reading Playwright's browser cache under `$HOME`.

Either way, a run that cannot acquire a browser stops before it captures anything, reporting the reason rather than a stack trace:

```
No browser to drive: <reason>
```

An attached browser that has died reads there as `connect ECONNREFUSED` on the endpoint the tab still advertises. Nothing restarts one, so a run that hits it is waiting on a tab relaunched with `-b`, not on a retry.

A run never closes an attached browser. Closing it would close the browser at the far end of the connection and leave the tab advertising an endpoint that refuses every later connect; the per-shot contexts are closed instead, and the connection itself ends with the run. A browser the run launched is closed when the run finishes.

### Shots that cannot be captured

An entry may name a binary it needs. When that binary is not on `PATH` the shot is skipped with `SKIP <name> — needs "<binary>" on PATH; capture it manually and commit the PNG.`, the run continues, and the names skipped are listed again at the end. A shot that fails outright is reported as `FAIL <name>: <reason>`, does not stop the remaining shots, and makes the run exit non-zero with `Failed: <names>`.

### Output

Captured PNGs are written to `documentation/public/screenshots/` at twice scale, cropped to the region the entry names, and are committed. They are generated output and are never hand-edited. A UI change that alters what a shot shows is regenerated and committed with that change, the same rule that applies to the prose describing it.
