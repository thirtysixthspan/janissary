# Queue commands for a shell

Send work to a shell tab with `queue <tab> <command>`:

```
queue worker make test
```

The command appends `make test` to `worker`'s queue. If the shell is idle, it runs through the shell's command bar. Otherwise it waits behind the work already queued. Application commands run in Janissary; unclaimed lines go to zsh.

<img class="agent-float" src="/agents/bilal-south-west.png" alt="" />

## Queue work while a shell is busy

Each shell tab has its own first-in-first-out queue. While zsh is running a command or the shell's workspace is still being prepared, its command prompt reads `queue >`. Anything you submit in the bar waits in the queue and is recorded in that bar's history.

Queued lines run one at a time when zsh returns to its prompt. A command answered by Janissary proceeds straight to the next queued line. A line sent to zsh waits for the next prompt. Submitting two lines quickly preserves their order even before the shell reports the first as running.

[`send`](/user-documentation/command-bar/send) to a shell joins the same queue. This works when the shell is current, docked in a sidebar, or hidden behind another tab. Keys typed directly into the terminal bypass the queue.

Shell and harness tabs have no command queue. Their commands dispatch immediately even while busy, and `Ctrl+E` or bare `queue` does nothing there. Other tab types offer a queue only when they support it.

## Edit queued commands

<img class="agent-float left" src="/agents/cavus-south.png" alt="" />

Press `Ctrl+E`, or enter bare `queue`, in a shell tab to open its queue popup. The next command to run appears at the top. An empty queue shows `(no commands queued)`. A popup opened from a docked shell belongs to that shell even while a shell tab is current.

Opening the popup copies the first row into its owner's command bar, which is the only editing surface.

| Input | Effect |
| --- | --- |
| `↑` / `↓` or click | Select a row and copy it into the command bar |
| Typing | Edit the selected row |
| `Backspace` / `Delete` with text | Edit the row normally |
| `Backspace` / `Delete` on an empty bar | Delete the row and leave the bar empty for repeated deletions |
| `Enter` / `Return` | Do nothing |
| `Escape` | Close the popup and clear its owner's bar |

Empty rows are allowed and run as no-ops. Closing the popup leaves other tabs' drafts and focus alone.

## Handle queue errors

Missing arguments print `Usage: queue <shell-tab> <command>`. An unknown target prints `No tab named "<label>".`. A tab without a queue, including an agent, prints `Tab "<label>" has no command queue.`. Success records `→ <label> (queued): <command>` in the issuing tab.

## Commands handled immediately

The shell bar handles `hist`, `nav`, `syntax theme`, bare `theme`, bare `profile launch`, `quit`, `close`, `exit`, bare `queue`, and bare `tasks` immediately. These interactive commands do not join the queue. `queue <tab> <command>` adds a line to the named queue.

A queue lasts only while its tab is open. It is not saved or restored by a launch.
