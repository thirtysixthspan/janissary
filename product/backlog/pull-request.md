<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* reattaching an agent that has been detached opens the tab
but reports the following error in the tab
Remote shell on 10.27.1.94 ended — start a new agent or shell to continue.
and in the notifications
osman on 10.27.1.94 could not be reattached: 10.27.1.94 accepted the reattach but never said what was running.
the new agent tab did not close.
the process 
/Users/anonymouscoward/.nvm/versions/node/v24.19.0/bin/node /Users/anonymouscoward/dev/janissary/dist/main.js remote-serve dev/janissary
fails to close even after the tab closes.

* opening a remote harness, then closing the tab fails to terminate the harness

* closing an agent tab on a remote harness fails to stop the process
/Users/anonymouscoward/.nvm/versions/node/v24.19.0/bin/node /Users/anonymouscoward/dev/janissary/dist/main.js remote-serve dev/janissary
that spawned when the agent opened.

