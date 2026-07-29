# Queue commands for an agent

Queue work for the current agent or send work to another agent with `queue <agent> <command>`:

```
queue worker db vacuum
```

The command appends `db vacuum` to `worker`'s queue. If `worker` is idle with no waiting work, it runs immediately. Otherwise it runs after the commands already in that queue.

<img class="agent-float" src="/agents/bilal-south-west.png" alt="" />

## Queue work while an agent is busy

Every agent tab has its own unbounded, first-in-first-out queue. A command submitted while that agent is busy joins the queue instead of running immediately. A command sent to an idle agent that already has waiting work joins the back of that queue too.

The issuing tab records `Queued: <command>` so you know the submission was accepted. The queue drains automatically from the front when the agent becomes idle. Shell commands run in order on the same shell, and a route chooser pauses the queue until you choose or cancel it.

While the current agent is busy, its command prompt shows `queue` before the chevron and its dot blinks. Submitting text at that prompt adds it to the queue.

<img class="agent-float left" src="/agents/cavus-south.png" alt="" />

Non-agent tabs never have command queues. Submissions to harness, image, page, Markdown, editor, file navigator, monitor, notification, and schedule tabs keep their normal behavior. The queue picker also does nothing when one of these tabs is exposed.

## Edit queued commands

Press `Ctrl+E`, or enter the bare `queue` command, to open the queue popup for the exposed agent tab. The next command to run appears at the top. When the queue is empty, the popup shows `(no commands queued)`.

<img class="agent-float" src="/agents/hamza-south-east.png" alt="" />

Opening the popup selects the front command and copies its text into the command line. The command line is the popup's only editing surface:

| Input | Effect |
|---|---|
| `↑` / `↓` or click | Select a row and copy its text into the command line |
| Typing | Patch the selected row immediately |
| `Backspace` / `Delete` with text | Edit the selected row normally |
| `Backspace` / `Delete` on an empty line | Remove the selected row and keep the popup open |
| `Enter` / `Return` | Do nothing |
| `Escape` | Close the popup and clear the command line |

An empty row is allowed until it reaches the front of the queue. It then runs as a no-op.

## Handle queue errors

`queue <agent> <command>` requires both an agent name and a command. If either is missing, the app prints:

```
Usage: queue <agent> <command>
```

An unknown target prints `No tab named "<label>".`. A known non-agent target prints `Tab "<label>" has no command queue.`. On success, the issuing tab records `→ <label> (queued): <command>`.

## Commands that never queue

These commands are handled immediately, even when the current agent is busy: `hist`, `nav`, `syntax theme`, `quit`, `close`, `exit`, bare `queue`, and bare `tasks`. The argument form `queue <agent> <command>` still reaches the target queue. `msg` and `broadcast` use their own per-recipient delivery order.

An agent's queue is saved with its state and restored by `janus --relaunch`. The relaunched agent starts idle, so restored commands wait until the first command is dispatched to that tab.
