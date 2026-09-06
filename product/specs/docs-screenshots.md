# Documentation screenshots

### Capture

`./scripts/run.mjs docs-screenshots` regenerates the screenshots the pages under `documentation/user-documentation/` reference. Passing shot names captures only those; passing a name no entry declares fails with `No manifest entries match: <names>`. Each shot is declared once in `scripts/docs-screenshots/manifest.mjs`, and the entry's name is its output filename, so a page's `/screenshots/<name>.png` path stays stable across reruns. The homepage hero, `demo.png`, is not a manifest shot and is never regenerated.

A run spins up **one** janissary instance and drives every shot through **one** browser page. The page stays open for the whole run because it has to: janissary shuts itself down about a second after its last websocket client disconnects, so a page closed between shots would take the session with it. When the last shot is captured, the page is closed, the app is stopped, the browser is let go, and the scratch directory is removed.

The scratch directory is created once, seeded from the fixtures, made into a git repository with a local `origin` so workspaced shots can clone, and given a `home` directory of its own so the app's homedir-scoped state never reads or pollutes the real one. A fixture web server supplies the page the embedded-web-page and browser shots point at, in place of a real site that could change or go down.

### Launch state between shots

Before every shot, including the first, the run puts the app back the way it launches: exactly one tab, labelled `janus`, carrying the root tab's colours, with an empty transcript, no command history, no schedules, no connections and no shells. Recreating the tab is what clears all of that at once — closing a tab releases everything it owns, where clearing a transcript would leave the rest behind. The working directory is put back to the fixture commit at the same time, so files a shot wrote are not in the next shot's file tree. Because the reset runs before every shot, a run that captures a subset produces the same image for a shot as a full run does.

One thing does not reset: the global command history that feeds ghost-text completion is held in memory for the life of the instance, so a shot's ghost text completes against every command the run has typed so far, not only its own.

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

An app that will not start stops the run the same way, and for the same reason — the whole run rests on the one instance:

```
No janissary to drive: <reason>
```

An attached browser that has died reads there as `connect ECONNREFUSED` on the endpoint the tab still advertises. Janissary replaces a browser that dies (see [[harness]]), so a run that hits it is worth starting again once; a second identical failure means the browser is gone for good and the tab needs relaunching with `-b`.

A run never closes an attached browser. Closing it would close the browser at the far end of the connection and leave the tab advertising an endpoint that refuses every later connect; the run's own context is closed instead, and the connection itself ends with the run. A browser the run launched is closed when the run finishes.

### Regenerating from a task

`ai/tasks/take-documentation-screenshots.md` is the unattended version of a capture run: it prepares the workspace, builds the bundle, captures, checks what changed, and ships the images through the ordinary merge workflow. Unlike a run started by hand it requires an attached browser and stops when the tab was not launched with `-b`, rather than falling back to launching one — inside a workspace that fallback can never work, and stopping before the build costs nothing.

The task ships PNGs and nothing else. It writes no documentation prose and adds no manifest entry; declaring a new shot belongs to the documentation-writing task that needs it. A skipped shot is a success it reports and continues past, a failed shot earns one retry, and a run that changed no bytes ships nothing at all.

### Shots that cannot be captured

An entry may name a binary it needs. When that binary is not on `PATH` the shot is skipped with `SKIP <name> — needs "<binary>" on PATH; capture it manually and commit the PNG.`, the run continues, and the names skipped are listed again at the end. A shot that fails outright is reported as `FAIL <name>: <reason>`, does not stop the remaining shots, and makes the run exit non-zero with `Failed: <names>`.

### Output

Captured PNGs are written to `documentation/public/screenshots/` at twice scale, cropped to the region the entry names, and are committed. They are generated output and are never hand-edited. A UI change that alters what a shot shows is regenerated and committed with that change, the same rule that applies to the prose describing it.
