<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* when a the remote channel has no more dependencies (agents, harnesses, file navigators) it should be closed and the remote-serve instance terminated so as not to have any dangling servers.

* the sessions tab should be auto refreshed when the tab receives focus

* closing a harness leaves an active and detached status line for the same harness. a single ssh/agent/harness should only have one line in sessions list at any time.
