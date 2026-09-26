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
| `request` | Runs `<text>` through the recipient's full command pipeline (same as if typed there), then sends the captured output back to the sender as a response. |
| `command` | Runs `<text>` through the recipient's full command pipeline, same as `request`, but sends no response back. |

Each kind also accepts a short alias: `i` for `info`, `r` for `request`, `c` for `command`.

A `request`'s response arrives in the sender's transcript as a `response from <agent>` block, and is added to the sender's context. On the sender's side, every sent message (of any kind) is recorded in the sender's own transcript as `→ <to> (<kind>): <text>`, so you have a record of what you sent even though it happened in another tab.

![An info message and a request/response exchange between two agent tabs in the transcript.](/screenshots/messaging-output.png)

## Broadcasting to several agents at once

<img class="agent-float left" src="/agents/dogan-south-east.png" alt="" />

`broadcast <all|agent[,agent...]> <info|request|command> <text>` sends the same message to more than one agent:

- `all` (or `*`) targets every other active agent tab.
- A comma-separated list (`bilal,cavus`) targets exactly those agents.

The sender is never included as a target, even if named explicitly. If any named recipient doesn't exist, the result reports it by name rather than silently dropping it.

## What a messaged command can run

<img class="agent-float" src="/agents/hakim-south-west.png" alt="" />

A messaged `request` or `command` is never moved into a terminal, because it has to hand captured text back to the sender and a takeover has none to give. An interactive program is refused with `Cannot run interactive command remotely: vim`, and so is a forced-terminal spelling of one: `shell --pty <cmd>`, `!!<cmd>`, or a bare `shell --pty` or `!!`, which names your `$SHELL` instead. This is the first thing you hit when you message an editor or a REPL to another agent.

`acp` and `browser` answer through their own command's capture rather than by reading back the last thing they wrote to the recipient's transcript. Every other command answers with the last entry it appended there.

## When the recipient tab closes

Closing a tab drops the messages still queued for it, and a command running in it at that moment never reports back. A response that arrives after the close is ignored. A later tab that reuses the name starts with an empty queue and takes its own `msg` and `broadcast` as normal.

## Completing recipient names

Press `Tab` at the recipient position of `msg` or `broadcast` to complete any open tab's label, not just an agent's name; for `broadcast`, `all` is offered too, and each entry of a comma-separated list completes independently. See [Tab completion](/user-documentation/command-bar/tab-completion) for the full picture of what completes where.
