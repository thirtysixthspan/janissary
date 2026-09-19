<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* the refresh icon in the metadata row should be light on dark.

* it should require a mouse double-click on a session row to cause the related tab to be focused, not a single click. A return should cause the tab indicated by the current keyboard caret highlighted to be focused.

* the conversations table should be organized host, type, tab name, state, time, actions. provide column names in the table

* the detach icon should use the font awesome link icon. When connected it should be green and when disconnected it should be red. in the green state the tool tip should say disconnect. in the red state the tool tip should say reconnect.  in the metadatarow row of an agent or harness the detach icon should be light on dark and be right aligned with the other buttons in the row.

* when a the remote channel has no more dependencies (agents, harnesses, file navigators) it should be closed and the remote-serve instance terminated so as not to have any dangling servers.

* the sessions tab should be auto refreshed when the tab receives focus

* closing a harness leaves an active and detached status line for the same harness. a single ssh/agent/harness should only have one line in sessions list at any time.
