# Queue commands for a shell

Send work to a shell tab with `queue <tab> <command>`:

```
queue worker make test
```

The command appends `make test` to `worker`'s queue. If the shell is idle, it runs through the shell's command bar. Otherwise it waits behind the work already queued. Application commands run in Janissary; unclaimed lines go to zsh.

<img class="agent-float" src="/agents/bilal-south-west.png" alt="" />

## Pick the target tab

The first word after `queue` is the target. It matches a tab's label or its display alias, in any letter case, and the first tab in the strip that matches wins. Hidden tabs count, and so does a shell that is still provisioning its workspace. The line waits there and runs once zsh starts.

Everything after the target is the command. Runs of spaces in it collapse to single spaces.

The target is always one word. A display alias with spaces in it can't be addressed with `queue`, and quotes don't help: `queue "build shell" make` reads `"build` as the tab name. Use the tab's label or rename the tab to a single word. Tab completion offers labels and aliases, but it doesn't quote an alias that contains spaces.

A queue has no size limit.

## Queue work while a shell is busy

Each shell tab has its own first-in-first-out queue. While zsh is running a command or the shell's workspace is still being prepared, its command prompt reads `queue >`. Anything you submit in the bar waits in the queue and is recorded in that bar's history.

Queued lines run one at a time when zsh returns to its prompt. A command answered by Janissary proceeds straight to the next queued line. A line sent to zsh waits for the next prompt. Submitting two lines quickly preserves their order even before the shell reports the first as running. A line also waits until the shell's terminal is attached, so nothing jumps ahead of an earlier line that can't reach zsh yet.

[`send`](/user-documentation/command-bar/send) to a shell joins the same queue. This works when the shell is current, docked in a sidebar, or hidden behind another tab. Keys typed directly into the terminal bypass the queue, and so does a [timer scheduled in a shell tab](/user-documentation/automation/scheduling#how-firing-behaves).

Shell tabs have a command queue; harness tabs do not. Other tab types can offer a queue when they support it.

## Runscripts in the system shell

<img class="agent-float left" src="/agents/hakim-south-east.png" alt="" />

[`execute <name>`](/user-documentation/automation/scheduling#run-a-runscript-now) and a due [system schedule](/user-documentation/automation/scheduling) both queue a runscript's lines in the hidden `system` shell. The system shell drains its queue without being shown or focused.

All lines of one runscript join the end of the queue together, so another run can't slip a line in between them. A line that fails doesn't stop the lines after it, and a scheduled run doesn't post a failure notice for any single line. An empty runscript adds nothing.

The queue isn't saved. If Janissary quits with lines still waiting, they don't run on the next launch.

## Edit queued commands

<img class="agent-float" src="/agents/cavus-south.png" alt="" />

Press `Ctrl+E`, or enter bare `queue`, to open a queue popup. It opens only over a tab that has both a queue and a command bar, which today means a shell tab. On a harness tab or any other tab without both, those inputs do nothing.

The next command to run appears at the top. An empty queue shows `(no commands queued)`. A popup opened from a docked shell belongs to that shell even while another tab is current.

Opening the popup replaces whatever you had typed in the owner's command bar with the selected row, or with nothing when the queue is empty. That bar is the only place you edit. Closing the popup clears the bar, and your earlier draft doesn't come back.

| Input | Effect |
| --- | --- |
| `↑` / `↓` or click | Select a row and copy it into the command bar |
| Typing | Edit the selected row |
| `Backspace` / `Delete` with text | Edit the row normally |
| `Backspace` / `Delete` on an empty bar | Delete the row and leave the bar empty for repeated deletions |
| `Enter` / `Return` | Do nothing |
| `Escape` | Close the popup and clear its owner's bar |

Each keystroke changes the queued row right away. There is no save step, and `Escape` doesn't undo your edits. Empty rows are allowed and run as no-ops. Closing the popup leaves other tabs' drafts and focus alone.

The list updates while the popup is open, for example when the front line starts running. Rows are addressed by position, so after the front line leaves, your selection points at whatever now sits in that position. An edit or delete aimed at a position that no longer exists does nothing. If the tab behind the popup closes and the tab you land on has no queue and command bar, the popup closes.

Editing a row that a system schedule queued turns it into an ordinary row. That matters for one rule: a scheduled `harness` line is the only kind that can [take the next free numbered label](/user-documentation/advanced-agents/harness#labels) when its name is taken. An edited copy gets the normal refusal instead.

## Handle queue errors

Missing arguments print `Usage: queue <shell-tab> <command>`. An unknown target prints `No tab named "<label>".`. A tab without a queue, including a harness, prints `Tab "<label>" has no command queue.`. Success records `→ <label> (queued): <command>` in the issuing tab.

## Commands handled immediately

The shell bar handles `hist`, `nav`, `syntax theme`, bare `theme`, bare `profile launch`, `quit`, `close`, `exit`, bare `queue`, and bare `tasks` immediately. These interactive commands do not join the queue. `queue <tab> <command>` adds a line to the named queue. When the hidden system shell reaches one of these words in its queue, it skips the picker rather than opening it unseen, and carries on with the next line.

A queue lasts only while its tab is open. It is not saved or restored by a launch.
