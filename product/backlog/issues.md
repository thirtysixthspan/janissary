# issues

## ready

When a shell command is running in an agent and is converted to an interactive pty through cntrl+o, the command continues to run in the interactive pty. however, when the command is complete, control is returned to the shell and a command line waits for input. Instead, when the command is complete, the interactive pty should close, and the command should end in the agent, freeing up the agent for subsequent commands.  


## development

## deferred

## declined
