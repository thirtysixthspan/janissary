
## tab monitoring
an agent should monitor one or more tabs and make suggestions in a custom UI panel

## File tree sidebar
A collapsible sidebar showing the directory tree rooted at the current tab's cwd, updated after each shell command. Clicking a file opens it with the existing open command (image, markdown, or OS viewer). Populated by a readdir call on the server after each queryShellPwd, sent as part of TabView.

## basic text file editor tab

## Tab name alias
rename <newname> gives a tab a display alias without changing its internal label (used for msg, persistence, routing). The strip shows the alias; everything else uses the original. title already exists on Tab for view tabs — same field, extended to agent tabs.
display alias can be changed with mouse click on the tab that transforms into an edit field populated with the current name, grabs the input focus. hitting enter or defocusing the input saves the current value.


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

## Input pre-fill from transcript click
Clicking any prompt line (❯ <command>) in the transcript copies that command into the command bar, ready to re-run or edit. Eliminates scrolling back through history to re-run a command seen on screen. Wired as an onClick on type === 'prompt' lines in Transcript.tsx.

## Command bar ghost text
As the user types, the most recent matching history entry appears as greyed ghost text after the cursor — → or End accepts it, any other key ignores it. Familiar from fish shell and modern browser address bars. Entirely client-side in CommandInput.tsx: scan cmdHistory for the longest prefix match and render the remainder as a muted <span>.

## Agent task queue
task add <agent> <command> enqueues a command to run as soon as the agent becomes non-busy, rather than firing immediately like msg … command. Prevents dropped commands when an agent is mid-turn. Extends the existing per-tab message FIFO with a held-until-idle gating layer.

## Unread badge on inactive tabs
When an inactive tab receives a new message or its shell command finishes while not focused, a small badge appears on its dot until the tab is visited. Gives at-a-glance awareness of which background agents have new output. Implemented as a hasUnread boolean on TabView, set on append and cleared when setActiveTab targets that tab.




## improvements

separate slow automated tests into a slow test suite only run at the end of feature development as a verification

closing a harness should close the harness tab

harness commands should make it into the transcript before launching the harness

