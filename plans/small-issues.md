# small issues

* web page tabs should have a metadata line that includes the full url and a right aligned close button.

* launch a command in the transcript should require a double click, not a single click.

* cmd+t should open a new agent tab in the root of the project - not workspaced

* in the editor, when viewing a file and it is not yet modified, the file should be watched for changes made by other processes, so that the file can be updated in real time with the changes being made. If the file has been modified by the user, it should not update. If the file has been modified by the user, and by another process, when the user goes to save changes, they should be prompted whether they want to overwrite the change by saving or cancel the action.

* when the editor window is being closed, if there are unsaved changes, the user should be presented with a dialog that says there are unsaved changes, close anyway or cancel.

* remove feature/user documentation from the README.md limiting it to install, startup and developer specific documentation. Provide a link to the public documentation site (github site for the repository) at the top of the README.md. extract the help text into help.md and update the code that renders this file to use the new file name.

* when a command is queued, the message `Queued: command` should appear where command is the command that was queued. 

* regression: text in the transcript window should be selectable.

* when previous commands in the transcript are clicked, they should be executed. however, the clickable window extends the entire like, when instead the clickable window should be limited to the text of the command itself.

* change the queue trigger to cntl+e

* when the queue window is open, hitting escape should close the queue window and remove any text on the command line.

* when running a command, the command should be printed in the transcript before the command is executed while the response is printed in the transcript after the command is executed.

* after a command is executed when it has been queued, the output is proceeded by two spourios lines. the first line contains the current working directory and the second line looks similar to __PWD_1_19829380192__. These seem related to tracking the current working directory, but should not be shown in the transciript.

* the command enqueue should be switched to queue

* agent status should be synced to and accurately reflect harness status. This may require a different solution for each supported harness.

* the queue command and key bindings need to be added to the help report.



