<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* when launching a new shell from an existing shell using the button in the metadata line, the new shell should open in the same working directory.

* the popups should be flush left without overlapping the color bar on the right of the tab, and flush against the command bar. 

* drag and drop from the file-navigator into the command bar should work for the shell tab, just like in the agent tab.

* opening the file navigator from the shell tab metadata bar should open the navigator in teh current working directory of the shell.

* when an application command is run that has an output, it should be interpreted as markdown and rendered into the shell as rendered markdown and not raw markdown.

* running `hist` or `ctrl+r` should result in the hitory picker appearing with the same content. right now the `hist` picker is empty.

* the nav command should launch the fuzzy navigation popup 

* shift+tab when the shell has focus should cause the command bar to have focus. shift+tab when the command bar has focus should cause the shell to have focus. this does not work.

* the state command should work in the shell tab just like the agent tab but output in rendered markdown
 
