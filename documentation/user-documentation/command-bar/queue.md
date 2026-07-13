# Command queue

<img class="agent-float" src="/agents/hakim-south.png" alt="" />

When an agent tab is busy, anything you submit to it doesn't get lost — it's queued and runs automatically once the agent is free. You can also queue a command for a *different* agent with `queue <agent> <command>`.

## Queue while busy

Submit as many commands as you like while a tab's agent is working. Each one joins that tab's queue and runs, in order, one at a time, as soon as the agent finishes what it's doing.

You'll always know a tab is busy and queuing: its command-line prompt reads `queue ❯` instead of the usual `❯`, and the dot beside it blinks — the same blink you already see on that tab in the tab strip.

## Queue for another agent

`queue <agent> <command>` appends a command to another agent's queue, whether or not you're on that agent's tab:

```
queue worker db vacuum
```

If `worker` is idle with nothing else queued, the command runs right away. If it's busy, or already has commands waiting, this one joins the back of the line.

## The queue popup

`Cmd+E` (or the `queue` command) opens a window listing everything queued for the current tab, with the next command to run at the top.

`↑`/`↓` move the selection, and selecting a row copies its text into the command line — that's also how you edit it: whatever you type there patches the selected row live. Backspacing all the way to an empty line and pressing Backspace once more removes that row and moves on to the next. `Escape` closes the popup; `Return` does nothing while it's open. Clicking a row selects it the same way the arrow keys do.

With nothing queued, the popup shows `(no commands queued)`.

## What's kept, and where

A tab's queue is part of its saved state, so it survives `janus --relaunch`. A relaunched tab always comes back idle — a restored queue waits and starts running as soon as you submit anything to that tab.

A few commands are always handled instantly and never queue, no matter how busy the tab is: `hist`, `nav`, `syntax theme`, `quit`, `close`, `exit`, `tasks`, and `queue` itself.
