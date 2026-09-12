# bugs

## ready

* controller tests are intermittently failing in the CI due to timeout. 
 FAIL   server  src/controller.test.ts > Controller notifications feed > records an incoming message to a background tab when the notifications tab is open
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/controller.test.ts:1611:3
    1609|     c.view().find((t) => t.view === 'notifications')!.bufferLines.map(…
    1610|
    1611|   it('records an incoming message to a background tab when the notific…
       |   ^
    1612|     withConfig({ incomingMessage: true, stateChange: false, scheduleFi…
    1613|     try {

## development

## deferred

* when closing harness tabs, the tab disappears, but the UI is not responsive for many seconds afterwards. the UI should retain responsible when closing harness tabs. Any teardown should be completed in the background, asynchronously. This may only apply to local tabs. more research needed.

*  saw this error: Already monitoring with persona "assistant" monitoring using the same assistant may happen multiple time but for different targets. in this case a new monitoring window should be opened

## declined
