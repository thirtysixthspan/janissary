
## harness tab transcripts
* harness tabs should have a tab transcript that records the harness output.

## scheduling of multistep procedures
the goal is to create a way to execute multiple steps in a tab, including in harnesses.
multistep procedures should be stored in a ./procedures directory
each procedure will be a file with a dasherized name stored in markdown format. the steps should be enumerated in a section called steps as a bulleted list of commands to be sent to the tab.

## File tree sidebar
A collapsible sidebar showing the directory tree rooted at the current tab's cwd, updated after each shell command. Clicking a file opens it with the existing open command (image, markdown, or OS viewer). Populated by a readdir call on the server after each queryShellPwd, sent as part of TabView.


## agent triggers
- file changes
- transcript triggers




## Multi-line input mode
Shift+Return inserts a newline in the command bar rather than submitting, letting you compose multi-line ACP prompts or shell heredocs before sending. A visible line count and a Ctrl+Return-to-submit hint appear in the bar. Requires changing the <input> to an auto-resizing <textarea> while keeping all existing chord handlers intact.

## Agent task queue
task add <agent> <command> enqueues a command to run as soon as the agent becomes non-busy, rather than firing immediately like msg … command. Prevents dropped commands when an agent is mid-turn. Extends the existing per-tab message FIFO with a held-until-idle gating layer.

## support sshing to other computers in an agent tab
list the connection in the connection window
close the ssh connection upon closing of the tab or application
ssh command should open a ssh connection in a new tab similar to how the harness command creates a new tab. 
exiting the ssh closes that tab.

## improvements

separate slow automated tests into a slow test suite only run at the end of feature development as a verification

 saw this error: Already monitoring with persona "assistant".
  monitoring using the same assistant may happen multiple time but for different targets.
  in this case a new monitoring window should be opened



