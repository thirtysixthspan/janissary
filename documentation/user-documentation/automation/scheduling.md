# Scheduling

`schedule` runs a command later — once, or on a repeating schedule:

```
schedule standup every day at 9:00 msg janus info daily check-in
schedule tests every 2h npm test
schedule reminder at 3:35pm clear
```

The first word after `schedule` names the timer (`standup`, `tests`, `reminder`); the rest says when, and everything after the time expression is the command to run. When a timer fires, its command runs in the tab that owns it exactly as if typed there — marked `## scheduled ##` in the transcript so you can tell it apart.

## Schedule forms

| Form | Meaning |
|---|---|
| `schedule <name> at <time> <cmd>` | Once, at a clock time — today, or tomorrow if it's already passed |
| `schedule <name> on <date> [at <time>] <cmd>` | Once, on a date (9:00am if no time given) |
| `schedule <name> every <N><m\|h\|d\|w> <cmd>` | Repeating at an interval — first run one interval from now |
| `schedule <name> every day at <time> <cmd>` | Repeating daily at a clock time |
| `schedule <name> every <weekday> at <time> <cmd>` | Repeating weekly (`monday`…`sunday`) at a clock time |

Times accept `3:35pm`, `2pm`, or 24-hour `14:00`. Dates accept `august 12th`, `aug 12`, or `8/12`. Timer names must be unique within a tab — a duplicate is rejected — and a malformed invocation prints the `Usage:` message without changing anything.

## Watching what's scheduled

While the active tab has timers, a small **schedule** window floats at the top right listing each one with its next run time; recurring timers are shown in the accent color. It disappears when the tab's schedule is empty.

![The floating schedule window listing two timers with their schedules and next run times.](/screenshots/schedule-window.png)

To manage timers from the command bar:

```
schedule list              every timer in this tab, with next-run times
schedule cancel tests      remove one (reports if there's no such name)
schedule clear             remove them all
```

## Scheduling into another tab

<img class="agent-float left" src="/agents/yusuf-south-east.png" alt="" />

An `in <tab>` clause right after the name attaches the timer to a different tab:

```
schedule standup in bilal every day at 9:00 state
schedule list in claude
schedule cancel standup in claude
```

The timer then belongs to the target tab — it shows in *that* tab's schedule window and fires there; your tab just gets the confirmation. Agent and harness tabs are valid targets; view tabs are refused with `Tab "<label>" cannot run scheduled commands.`, and a name that matches nothing with `No tab named "<label>".` The `in <tab>` form is also the only way to manage a harness tab's timers, since a harness has no command bar of its own.

## How firing behaves

<img class="agent-float" src="/agents/hakim-south-west.png" alt="" />

In an agent tab, the command is dispatched as if typed. In a [harness tab](/user-documentation/advanced-agents/harness), the command is typed into the harness as a line of input — and if the harness isn't accepting input yet, the timer stays due and retries until it lands. After firing, a one-shot timer is removed; a recurring one advances to its next run.

An agent's timers persist with its state, surviving `janus --relaunch` — a timer whose agent isn't currently open simply waits until that agent is open again. Harness tabs' timers are the exception: they live in memory only and end when the harness tab closes.

[Profiles](/user-documentation/automation/profiles) can pre-author a harness tab's schedule so it's set up on every launch.
