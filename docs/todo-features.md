
## 
 create a right and left sidebar that are not normally show on launch. update the files command with an option to launch the file navigator in the left or right sidebar.
 add a button in the files-header that shifts the file navigator between one of three locations, right sidebar, central tab window, and left sidebar. 
 the width of the right and left side bars should be adjustable by moving the borders using the mouse.


## scheduling of multistep procedures
the goal is to create a way to execute multiple steps in a tab, including in harnesses.
multistep procedures should be stored in a ./procedures directory
each procedure will be a file with a dasherized name stored in markdown format. the steps should be enumerated in a section called steps as a bulleted list of commands to be sent to the tab.

## spin up multiple independent instances of janissary
Create an easy way to launch the janissary in a target directory.
a single server instance will be responsible for interacting with a single UI instance.
when a second instance is launched in a different directory, it will create a new server instance and new UI instance. 
two instances cannot be launched with overlapping file trees.
multiple instance cannot share the same communication channels such as web sockets.

## harness tab transcripts
harness tabs should have a tab transcript that records the harness output.
For example, if claude or opencode are running in the harness, it is expected that the output of their work is captured in the transcript.
  
# deferred

## separate slow automated tests into a slow test suite 
  only run at the end of feature development as a verification

## fix monitoring error 
 saw this error: Already monitoring with persona "assistant".
  monitoring using the same assistant may happen multiple time but for different targets.
  in this case a new monitoring window should be opened

## Agent task queue
task add <agent> <command> enqueues a command to run as soon as the agent becomes non-busy, rather than firing immediately like msg … command. Prevents dropped commands when an agent is mid-turn. Extends the existing per-tab message FIFO with a held-until-idle gating layer.

## agent triggers
- file changes
- transcript triggers

