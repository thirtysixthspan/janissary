# Queue commands for an agent or shell

Queue work for the current agent or shell, or send work to another agent or shell tab with `queue <tab> <command>`:

```
queue worker db vacuum
```

The command appends `db vacuum` to `worker`'s queue. If `worker` is idle with no waiting work, it runs immediately. Otherwise it runs after the commands already in that queue. A shell tab accepts queued lines too; it routes each line through its command bar before sending unclaimed commands to zsh.

<img class="agent-float" src="/agents/bilal-south-west.png" alt="" />

## Queue work while an agent is busy

Every agent tab has its own unbounded, first-in-first-out queue. A command submitted while that agent is busy joins the queue instead of running immediately. A command sent to an idle agent that already has waiting work joins the back of that queue too.

The tab the command was queued *for* records `Queued: <command>` so you know the submission was accepted. For a [`send`](/user-documentation/command-bar/send) or a message from another tab, that line is in the recipient's transcript, not the sender's. The queue drains automatically from the front when the agent becomes idle, and it keeps going rather than stalling: a command that finishes without putting the agent back to work is followed straight away by the next one. Shell commands run in order on the same shell, and each one's output is only its own — none of the working-directory bookkeeping the app uses to track a shell leaks in from the command beside it. A route chooser pauses its own tab's queue until you choose or cancel it. Other tabs keep draining.

While the current agent is busy, its command prompt shows `queue` before the chevron and its dot blinks. Submitting text at that prompt adds it to the queue.

<img class="agent-float left" src="/agents/cavus-south.png" alt="" />

Harness, image, page, Markdown, editor, file navigator, monitor, notification, and schedule tabs have no command queue. Submissions to them keep their normal behavior. The queue picker also does nothing when one of these tabs is exposed.

## Edit queued commands

Press `Ctrl+E`, or enter the bare `queue` command, to open the queue popup for the exposed agent or shell tab. Entering `queue` in a shell docked in a sidebar opens the popup for that shell, even when an agent tab is exposed. The next command to run appears at the top. When the queue is empty, the popup shows `(no commands queued)`.

<img class="agent-float" src="/agents/hamza-south-east.png" alt="" />

Opening the popup selects the front command and copies its text into the command line. The command line is the popup's only editing surface:

| Input | Effect |
|---|---|
| `↑` / `↓` or click | Select a row and copy its text into the command line |
| Typing | Patch the selected row immediately |
| `Backspace` / `Delete` with text | Edit the selected row normally |
| `Backspace` / `Delete` on an empty line | Remove the selected row, keep the popup open on an empty command line, and hold the selection inside the list, so repeated presses delete row after row |
| `Enter` / `Return` | Do nothing |
| `Escape` | Close the popup and clear the command line |

An empty row is allowed until it reaches the front of the queue. It then runs as a no-op.

The popup and the drain can reach the same row at once. If the queue runs a command off while you are typing into that row, your edit is dropped rather than landing on whichever row took its place.

## Handle queue errors

`queue <tab> <command>` requires both a tab name and a command. If either is missing, the app prints:

```
Usage: queue <agent> <command>
```

An unknown target prints `No tab named "<label>".`. A target without an agent or shell queue prints `Tab "<label>" has no command queue.`. On success, the issuing tab records `→ <label> (queued): <command>`.

## Commands that never queue

These commands are handled immediately, even when the current agent or shell is busy: `hist`, `nav`, `syntax theme`, bare `theme`, bare `profile launch`, `quit`, `close`, `exit`, bare `queue`, and bare `tasks`. The argument form `queue <tab> <command>` still reaches the target queue. `msg` and `broadcast` use their own per-recipient delivery order.

An agent's queue lasts as long as the tab: it is not saved, and no launch brings it back.
