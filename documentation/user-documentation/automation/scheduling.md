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

In the web app, a clock icon in the tab's metadata bar opens this same panel: it lights up whenever the tab has a scheduled entry, and stays dark and unclickable with an explanatory tooltip when it doesn't. Hovering the lit icon shows the panel; moving away hides it again. Clicking pins the panel open until you click a second time. Switching to a tab with scheduled entries auto-shows its panel for five seconds before fading; moving the pointer onto the icon or panel during that window cancels the fade and hands off to normal hover behavior.

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

In an agent tab, the command is dispatched as if typed. If the agent is busy when the timer fires, the command joins its [command queue](/user-documentation/command-bar/queue) instead of running right away — it runs once the agent is free, same as anything else queued there. In a [harness tab](/user-documentation/advanced-agents/harness), the command is typed into the harness as a line of input — and if the harness isn't accepting input yet, the timer stays due and retries until it lands. After firing, a one-shot timer is removed; a recurring one advances to its next run.

An agent's timers persist with its state, surviving `janus --relaunch` — a timer whose agent isn't currently open simply waits until that agent is open again. Harness tabs' timers are the exception: they live in memory only and end when the harness tab closes.

[Profiles](/user-documentation/automation/profiles) can pre-author a harness tab's schedule so it's set up on every launch. Since launching a harness is an ordinary command, you can schedule one with a starting prompt too — wrap the whole [`harness … with <prompt>`](/user-documentation/advanced-agents/harness) command:

```
schedule deploy at 5pm harness claude with fix the failing tests
```

This opens a fresh harness tab at 5pm and feeds it that prompt as soon as it's ready.

## Seeing every schedule at once

<img class="agent-float left" src="/agents/tahir-south-east.png" alt="" />

`schedules` (plural) opens one tab that aggregates every scheduled command across every open tab into a single list, ordered by next-to-run, regardless of which tab owns each entry — where the floating schedule window shows only the active tab's own timers. There's only ever one; a second `schedules` reuses it instead of opening another.

```
schedules         open (or focus) the aggregated list
schedules left    dock it in the left sidebar
schedules right   dock it in the right sidebar
```

![The aggregated schedules tab listing two timers with their owning tab, next-run time, spec, and command.](/screenshots/schedules-tab.png)

The tab is view-only — it has no command bar. Each row shows the owning tab, the timer's name, its next-run time, its schedule spec, and the command it runs; recurring entries are shown in the accent color, matching the schedule window. Docked into a sidebar, the list compresses to next-run time, name, and owning tab, dropping the command and spec to fit the narrower width. Either way the list updates live as timers fire and new ones are added — no need to reopen it — and shows "No scheduled commands." when nothing is scheduled anywhere.

Click a row to select it; double-click it, or press `Enter` with it selected, to jump straight to the tab that owns it. `↑`/`↓` move the selection one row at a time, and `Home`/`End` jump to the first or last row. Pressing `Backspace` or `Delete` on a selected row opens a confirmation dialog — `Delete schedule "<name>"?` with **Delete** and **Cancel** — and confirming cancels that timer in its owning tab, the same as `schedule cancel <name>` run there. Creating or editing a schedule still happens with the `schedule` command in the tab that owns it.

Like the [notifications feed](/user-documentation/tab-types/notifications), the schedules tab can dock into either sidebar and shares that sidebar with other dockable tabs rather than displacing them; while docked, its header carries a button to cycle it to the other side.

## Scheduling from a dialog

In the web app, typing bare `schedule` — the word with nothing after it — opens a **New schedule** dialog instead of printing the `Usage:` message. (The terminal app still prints `Usage:` for a bare `schedule`.)

The dialog has a name field, a target-tab dropdown (agent and harness tabs only, defaulting to the tab you're on), a schedule-type selector covering all five forms above, the inputs that type needs, and a command field. **Schedule** stays disabled until the name, command, and that type's required inputs are filled in; submitting it is equivalent to typing the same `schedule` command by hand, so a duplicate name or parse problem shows up as a transcript line just like it would from the command bar. **Cancel** or `Escape` closes it without scheduling anything. Your entries are remembered if you reopen the dialog later in the same session.

The dialog only creates new timers — manage existing ones with `schedule list` / `cancel` / `clear`, or the schedules tab above.
