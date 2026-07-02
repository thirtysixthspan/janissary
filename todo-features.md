

## File tree sidebar
A collapsible sidebar showing the directory tree rooted at the current tab's cwd, updated after each shell command. Clicking a file opens it with the existing open command (image, markdown, or OS viewer). Populated by a readdir call on the server after each queryShellPwd, sent as part of TabView.


## Transcript search
`search transcript regex_pattern` command pattern.
enters search mode in the current tab.
command bar turns into search bar.
escape exits the search mode restoring the command bar.
most recent matching line is shown in the search bar.
most recent matching line in transcript is highlighted with a background color.
transcript is scrolled to most recent matching line showing the matchning line plus minus 2 lines of transcript just above the search bar.
up and down arrow scrolls through less or more recent matches, updating the search bar content and the transcript location.
if no matches are found, there is no need to open the search bar, only report no matches found in the transcript.

## agent triggers
- file changes
- transcript triggers

## open files, urls, search on transcript window content
When transcript output contains a file:line pattern (e.g. src/foo.ts:42), clicking it opens the file at that line in the OS default editor via a URI scheme (vscode://file/…). Turns compiler and linter output into navigable source links with no extra commands. Uses the same OS-open path as open external.

## acp Conversation reset
reset kills the current tab's ACP subprocess and starts fresh on the next prompt, clearing the accumulated context window. Useful when a long session has drifted or the model is confused by prior turns. The ACP connection already reconnects lazily on the next prompt; reset just makes the disconnect explicit and user-triggered.

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

harness tabs should have a tab transcript
monitors should have access to the tab transcript

update or remove next run time in schedule after a run

web links in agent windows should open web view tabs rather than chrome tabs.

remove tool tip on hover of commands in the transcript
automatically excute the commands by sending them through the command line: dont require a return jeypress to execute.

