# Messaging

<img class="agent-float" src="/agents/demir-south-west.png" alt="" />

The `msg` and `broadcast` commands send a message from one agent tab to another, so agents can hand off information or trigger work without a person relaying it:

```
msg bilal info the deploy is done
broadcast all info standup in 5 minutes
```

Each recipient has its own FIFO queue, processed one message at a time, so messages from different senders never interleave mid-delivery.

## Message kinds

`msg <agent> <info|request|command> <text>` accepts three kinds, each with different delivery behavior:

| Kind | What happens at the recipient |
|---|---|
| `info` | Shown in the recipient's transcript and added to its context. Nothing runs. |
| `request` | Recorded in the recipient's transcript as `sent request: <text>`, attributed to you, then run through its full command pipeline (same as if typed there). The captured output comes back to the sender as a response. |
| `command` | Recorded in the recipient's transcript as `sent command: <text>`, attributed to you, then run through its full command pipeline, same as `request`, but sends no response back. |

Each kind also accepts a short alias: `i` or `informational` for `info`, `r` or `req` for `request`, `c` or `cmd` for `command`.

A `request`'s response arrives in the sender's transcript as a `response from <agent>` block, and is added to the sender's context. On the sender's side, every `msg` is recorded in the sender's own transcript as `→ <to> (<kind>): <text>`, so you have a record of what you sent even though it happened in another tab. A `broadcast` writes no such line.

## When a message names nobody

<img class="agent-float left" src="/agents/selim-south-west.png" alt="" />

A `msg` to a name no open tab answers to reports `No agent named "<name>".` in the tab you typed it in, and a `broadcast` whose list holds one or more unknown names reports them together as `No agent named: <name>, <name>.` Reaching the other recipients is not reported, and `broadcast` writes no line of its own when every name was found. The rest of the grammar is refused in the same place:

| What you typed | What you get |
|---|---|
| `msg bilal` or bare `msg` | `Usage: msg <agent> <info\|request\|command> <text>` |
| `msg bilal note find the bug` | `Unknown message type "note". Use info, request, or command.` |
| `msg bilal info` with no text | `Message text is empty.` |
| `broadcast` or `broadcast * info` with no text | `Usage: broadcast <all\|agent[,agent...]> <info\|request\|command> <text>` |

![An info message and a request/response exchange between two agent tabs in the transcript.](/screenshots/messaging-output.png)

## Broadcasting to several agents at once

<img class="agent-float left" src="/agents/dogan-south-east.png" alt="" />

`broadcast <all|agent[,agent...]> <info|request|command> <text>` sends the same message to more than one agent:

- `all` (or `*`) targets every other tab, whatever kind it is — an editor, a page, a file navigator, a monitor, anything with a label.
- A comma-separated list (`bilal,cavus`) targets exactly those tabs, and nothing filters the list: name yourself and you message yourself, exactly as naming a tab twice would.

Reaching the other tabs is not reported back. What you do get is a line naming any recipient that doesn't exist, and no line at all when every name was found; see [When a message names nobody](#when-a-message-names-nobody).

## What a messaged command can run

<img class="agent-float" src="/agents/hakim-south-west.png" alt="" />

A messaged `request` or `command` is never moved into a terminal, because it has to hand captured text back to the sender and a takeover has none to give. An interactive program is refused with `Cannot run interactive command remotely: vim`, and so is a forced-terminal spelling of one: `shell --pty <cmd>`, `!!<cmd>`, or a bare `shell --pty` or `!!`, which names your `$SHELL` instead. This is the first thing you hit when you message an editor or a REPL to another agent.

`acp` and `browser` answer through their own command's capture rather than by reading back the last thing they wrote to the recipient's transcript. Every other command answers with the last entry it appended there.

## When the recipient tab closes

Closing a tab drops the messages still queued for it, and a command running in it at that moment never reports back. A response that arrives after the close is ignored. A later tab that reuses the name starts with an empty queue and takes its own `msg` and `broadcast` as normal.

## Completing recipient names

Press `Tab` at the recipient position of `msg` or `broadcast` to complete any open tab's label, not just an agent's name; for `broadcast`, `all` is offered too, and each entry of a comma-separated list completes independently. See [Tab completion](/user-documentation/command-bar/tab-completion) for the full picture of what completes where.
