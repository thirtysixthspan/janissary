<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* tab completion results should nto be joined without spaces. This is an example bad output:
AGENTS.mdaicareer scenariosCLAUDE.mdclimate-ai.jsonlguidanceinterviewsjob searchlinkedinmagda_kufrej_gistsnotesprepproductresumestemp

* hitting escape should remove the tab completion popup

* the shell path in the metadata row should track the current working directory of the shell thoguhout the session. as the user changes path, the path in the metadata row should update.

* remove all shell prompt formatting and leave only `> ` by sending the following to the shell when it launches and before the output becomes visible to the user - export PROMPT='> ' 

* pre and post hooks should be added when the shell launches but before the output become visilbe to the user.

* all popups should render above the command bar, not on top of it. This should be that same positioning as in the agent tab. it should not overlap the left colored border of the tab. history picker, clipboard picker, queue picker, tab navigator, quick file finder, theme picker, syntax theme picker.

* shift+tab should bound the keyboard input focus back and forth between the command line and the shell.  This does not work currently.

* when a shell tab is no longer busy and is in teh background it should throw an unread badge like the agent tab. the unread badge should have the same notfication logic as when the harness tab throws a flag.

* commands with transcript output like 'help' should render the command into the shell without executing it, and, on a new line, print the output into the shell without executing it. it should look like the command went to the shell and then returned the result even though it is an application command.

* the path in the metadatabar should render the shortcuts $root and $workspace as part of the path when appropriate.

* the application theme should propogate into the shell and the theme picker should update the application theme and the shell theme.

* application commands should be added to the command history when executed, not just shell commands.

* the following keybindings for agent tabs should apply to the shell tab navigation
Shift+↑ / Shift+↓	Scroll the transcript up / down (accelerated — distance doubles each second)
Ctrl+↑ / Ctrl+↓	Scroll the transcript up / down (accelerated)
Page Up / Page Down	Scroll the transcript up / down by half terminal height
Escape	Reset scroll to bottom



