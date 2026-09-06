# issues

## ready

* The documentation screenshot pipeline still kills the tab's e2e browser after the first shot, and the cause is not the supervisor #989 reverted. Observed on `master` at 95a52eb6, with #987 already reverted and #990's guard fix in place: a `./scripts/run.mjs docs-screenshots` run in a `-b` workspace connected, captured `app-overview` normally, and the browser child exited in the same second the PNG was written. Nothing ever asked it to close — the run reached no second shot, so no `browser.close()`, no `file:` URL, and no unparseable frame was sent. This is the empirical repro #990 asked for before any second attempt at replacing a dead browser, and it moves the fault off the supervisor: #987 was reacting to a browser that was already dying, and #989 removed the mitigation without removing the fault. The failure signature #989 documented (`OK app-overview` then every later shot failing on `Target page, context or browser has been closed`) is what a client holding one connection sees when the browser dies right after shot one, with or without a relaunch behind it.

* The e2e browser child throws away the reason its browser died, which is why the failure above cannot be diagnosed. `src/browser/e2e-child.ts` ends with `server.on('close', () => process.exit(0))`, so the wrapper exits silently and with code 0 whether Chromium crashed, was killed by the OS, or shut down cleanly. The parent reports `e2e browser exited` through `withChildOutput` with an empty tail, and a notification carrying nothing but that message is the absence of a clue rather than evidence of a graceful shutdown. Playwright exposes the browser process at that point; recording its exit code and signal before exiting is the difference between "exited" and "killed by SIGKILL".

* An e2e browser that dies unexpectedly has its scratch directory deleted before anyone can examine it. `stopSession` calls `release()`, which calls `session.scratch?.remove()` (`src/browser/e2e-session.ts`), on every teardown path — the user closing the tab and the browser dying on its own are treated identically. Chromium's user data directory, its temp sibling, and any crash dump it managed to write all live inside that pair, so they are `rmSync`'d milliseconds after the death. Keeping the directory on the unexpected-death path, and removing it only on a teardown the user asked for, would leave a post-mortem to read.

* `scripts/docs-screenshots/browser.mjs` still claims janissary replaces a browser that a screenshot run closes. The comment above `openAttached` reads "janissary would replace the browser anyway if it did land", which was true only between #987 and its revert in #989. Nothing restarts a dead browser now, so the comment offers a safety net that does not exist to whoever next edits that function.

* The screenshot task's browser precheck cannot detect a dead browser. `ai/tasks/take-documentation-screenshots.md` gates on `!!process.env.JANISSARY_BROWSER_WS_ENDPOINT` and `!!process.env.JANISSARY_PLAYWRIGHT`, but both variables are set once when the tab is spawned and are never cleared, so they still read `true` long after the browser has exited. A run that starts in that state spends a full `npm run build:web` and a capture before discovering there is nothing to drive. Probing the endpoint — a connect, or even a bare TCP dial — would fail in the step written to catch exactly this.

## development

## deferred

## declined
