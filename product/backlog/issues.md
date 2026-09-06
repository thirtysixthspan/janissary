# issues

## ready

* An e2e browser that dies unexpectedly has its scratch directory deleted before anyone can examine it. `stopSession` calls `release()`, which calls `session.scratch?.remove()` (`src/browser/e2e-session.ts`), on every teardown path — the user closing the tab and the browser dying on its own are treated identically. Chromium's user data directory, its temp sibling, and any crash dump it managed to write all live inside that pair, so they are `rmSync`'d milliseconds after the death. Keeping the directory on the unexpected-death path, and removing it only on a teardown the user asked for, would leave a post-mortem to read.


## development

## deferred

* The documentation screenshot pipeline still kills the tab's e2e browser after the first shot, and the cause is not the supervisor #989 reverted. Observed on `master` at 95a52eb6, with #987 already reverted and #990's guard fix in place: a `./scripts/run.mjs docs-screenshots` run in a `-b` workspace connected, captured `app-overview` normally, and the browser child exited in the same second the PNG was written. Nothing ever asked it to close — the run reached no second shot, so no `browser.close()`, no `file:` URL, and no unparseable frame was sent. This is the empirical repro #990 asked for before any second attempt at replacing a dead browser, and it moves the fault off the supervisor: #987 was reacting to a browser that was already dying, and #989 removed the mitigation without removing the fault. The failure signature #989 documented (`OK app-overview` then every later shot failing on `Target page, context or browser has been closed`) is what a client holding one connection sees when the browser dies right after shot one, with or without a relaunch behind it.

## declined
