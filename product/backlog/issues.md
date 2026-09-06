# issues

## ready

* `browser.close()` from a harness script permanently destroys that tab's e2e browser. The endpoint handed out by `-b` is a client connection to `chromium.launchServer()`, so closing the connected browser closes the remote browser, which fires the server's close handler in `src/browser/e2e-child.ts` (`server.on('close', () => process.exit(0))`). The child exits, nothing restarts it, and every later connect gets ECONNREFUSED on the endpoint the tab is still advertising. This is the ordinary Playwright teardown, so it is easy to reach by accident, and the failure is silent until the next run. A fix would let the browser outlive a client disconnect, so one bad teardown does not cost the tab its browser for the rest of its life.

## development

## deferred

## declined
