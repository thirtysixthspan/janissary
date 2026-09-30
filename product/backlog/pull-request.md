<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request


* remove the statement history UI sql-history-toggle and backing support code. the command bar should be the only way to inspect the command history.

* individual cells should not be highlightable, only rows. clicking once on the row will highlight it. click twice will allow you to edit a particular cell. on tab opening or after a new query, the highlight should be on the first row. mirrow the highlighting and navigation of the file-navigator. when the keyboard focus is on the table, up and down arrows should cause the highlighted row to move up or down and scroll the results when required. left and right arrows should have no effect.

* auto refresh the tab after a query is typed and executed in the command bar

* sql-console-result results should be removed from the tab and reported instead as a notification. short results can be reported in the notification directly. when the result is too long the shortened result is presented and the full result is provided by a link to a file containing the full result, similarly to how a auto-permit notification attaches a link to a screen capture.

* when the sql command bar is focused, keyboard bindings in the sql command bar should mirror those in the agent command bar. in particular left and right arrow should move the cursor caret left and right and up and down arrows should move through the sql command history. tab should move focus from the command bar to the tab. another tab should bring the focus back to the command bar.