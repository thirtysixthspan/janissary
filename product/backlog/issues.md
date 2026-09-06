# issues

## ready

* `browser.close()` from a harness script permanently destroys that tab's e2e browser. The endpoint handed out by `-b` is a client connection to `chromium.launchServer()`, so closing the connected browser closes the remote browser, which fires the server's close handler in `src/browser/e2e-child.ts` (`server.on('close', () => process.exit(0))`). Let the browser outlive a client disconnect, so one bad teardown does not cost the tab its browser for the rest of its life.

## development

## deferred

## declined
