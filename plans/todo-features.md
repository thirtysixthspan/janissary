# deferred

## fix monitoring error 
 saw this error: Already monitoring with persona "assistant".
  monitoring using the same assistant may happen multiple time but for different targets.
  in this case a new monitoring window should be opened

## Agent command queue
An agent tab has a command queue that holds the list of commands to be executed.
All commands entered into the command line will go into the command queue.
When an agent is free, the command queue will be checked for the next command to run.
A single command may be processed at a time.
When the agent accepts a command, the agent becomes busy until the command completes.
When the agent is busy, all commands entered in the command line go into the agent command queue.
When there are no more commands in the queue, the agent will become free.
When the agent is busy, the dot in the tab should blink.
When the exposed agent tab is busy, the dot in the command line should blink.
When the exposed agent tab is busy, the command line will show `queue >` insead of `>`.
cmd+e will bring up the agent queue in a popup window over the command line, similar to the history window.
The window will be titled queue.
When the window is open, escape will close the window.
When the window is open, the selector in the window can be moved up or down using the up or down arrow keys.
When an item is selected, it will be copied to the command line, over writing and text in the command line. 
When the window is open, editing text in the command line will update the corresponding command in the command queue. 
When the window is open, hitting enter or return in the command queue will do nothing.
When the window is open, hitting the delete or backspace key will remove the command from the queue that is currently selected.
`Enqueue <agent> <command>` adds a command into the command queue of agent.
Only agent tabs have command queues.
add spec to capture the command queue.
add public documentation of the cammand queue.


## agent triggers
- file changes
- transcript triggers
