# bugs

## ready

* intermittent bug likely due to a race condition: on launch the window and UI are displayed but the command line does not have the keyboard focus and clicking on the command line does not recover the focus. the app must be restarted by closing the window. In rarer cases, the window opens but the UI fails to render entirely. again the app must be restarted by closing the window. 

## development

## deferred

* when closing harness tabs, the tab disappears, but the UI is not responsive for many seconds afterwards. the UI should retain responsible when closing harness tabs. Any teardown should be completed in the background, asynchronously. This may only apply to local tabs. more research needed.

*  saw this error: Already monitoring with persona "assistant" monitoring using the same assistant may happen multiple time but for different targets. in this case a new monitoring window should be opened

## declined
