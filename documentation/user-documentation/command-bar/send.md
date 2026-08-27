# Send input to a tab

<img class="agent-float" src="/agents/fariz-south.png" alt="" />

`send <tab> <text>` delivers a line of input to any tab, as if you had typed it there yourself:

```
send claude /standup
send worker db vacuum
```

Name the tab by its label, the way it appears in the strip. A tab you renamed answers to its display name too. `Tab` completes the name against every open tab, so you rarely have to type it in full. Tab numbers don't work here — `send 2 …` looks for a tab actually named `2`.

This is not [messaging](/user-documentation/command-bar/messaging). `msg` and `broadcast` put a message in another agent's inbox for it to read; `send` puts text on that tab's input line and presses Return.

## What happens depends on the tab

For a [harness](/user-documentation/advanced-agents/harness) or [SSH](/user-documentation/advanced-agents/harness#ssh-sessions) tab, the text is typed into the terminal and submitted, exactly like typing into it by hand. That's how you drive a running `claude` or `codex` session from somewhere else.

For an agent tab, the text runs as a command in that tab's own pipeline — a shell command, a `db` query, anything you could type there. If that tab is busy, the command waits in its [queue](/user-documentation/command-bar/queue) instead of being lost.

Nothing else accepts input. Image, page, markdown, editor, and other view tabs have no input line to deliver to.

## Where the result goes

<img class="agent-float left" src="/agents/hakim-south-west.png" alt="" />

Your own transcript records what you sent:

```
→ claude: /standup
```

That's the whole acknowledgement. `send` is fire-and-forget: the target's output stays in the target's tab, and nothing is read back to you. To watch what a tab does with what you sent, switch to it, or point a [monitor](/user-documentation/automation/monitoring) at it.

Errors land in *your* transcript rather than the target's, so a send that went nowhere is always visible — including one fired by a schedule while you were elsewhere:

| Message | What happened |
|---|---|
| `Usage: send <label> <text>` | You typed bare `send` |
| `No text to send.` | You named a tab but gave it nothing to type |
| `No tab named "<label>".` | No open tab has that label or display name |
| `Tab "<label>" is not a running harness.` | The harness in that tab has exited |
| `Tab "<label>" does not accept input.` | The target is a view tab |

## Send on a schedule

`send` is an ordinary command, so [`schedule`](/user-documentation/automation/scheduling) drives it like any other:

```
schedule standup every day at 9am send claude /standup
schedule sweep every 1h send worker db vacuum
```

The timer lives in the tab you ran `schedule` in, and each firing sends to the target from there. To put the timer in the target tab instead, use the `in <tab>` form of `schedule`.

## Where you can run it

<img class="agent-float" src="/agents/tahir-south-west.png" alt="" />

From any agent tab. A harness tab has no command bar of its own — everything you type there goes to the harness — so you can't send *from* one, only *to* one.
