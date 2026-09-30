<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request


* sql-console-result results should be removed from the tab and reported instead as a notification. short results can be reported in the notification directly. when the result is too long the shortened result is presented and the full result is provided by a link to a file containing the full result, similarly to how a auto-permit notification attaches a link to a screen capture.

* when the sql command bar is focused, keyboard bindings in the sql command bar should mirror those in the agent command bar. in particular left and right arrow should move the cursor caret left and right and up and down arrows should move through the sql command history. tab should move focus from the command bar to the tab. another tab should bring the focus back to the command bar.