# small issues

* in the editor, when viewing a file and it is not yet modified, the file should be watched for changes made by other processes, so that the file can be updated in real time with the changes being made. If the file has been modified by the user, it should not update. If the file has been modified by the user, and by another process, when the user goes to save changes, they should be prompted whether they want to overwrite the change by saving or cancel the action.

* when the editor window is being closed, if there are unsaved changes, the user should be presented with a dialog that says there are unsaved changes, close anyway or cancel.

* change the queue trigger to cntl+e

* when the queue window is open, hitting escape should close the queue window and remove any text on the command line.

* when running a command, the command should be printed in the transcript before the command is executed while the response is printed in the transcript after the command is executed.

* after a command is executed when it has been queued, the output is proceeded by two spourios lines. the first line contains the current working directory and the second line looks similar to __PWD_1_19829380192__. These seem related to tracking the current working directory, but should not be shown in the transciript.

* the command enqueue should be switched to queue

* agent status should be synced to and accurately reflect harness status. This may require a different solution for each supported harness.

* the queue command and key bindings need to be added to the help report.



