# Scheduling

<img class="agent-float" src="/agents/orhan-south.png" alt="" />

`schedule` runs a command later — once, or on a repeating schedule:

```
schedule standup every day at 9:00 notify daily check-in
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

## Project system schedules

System schedules belong to the project rather than a tab, so they survive tab closure and app restarts. They run a named runscript:

```
schedule system deploy at 5pm script deploy
schedule system cleanup every day at 2am script cleanup
schedule system list
schedule system cancel deploy
schedule system clear
```

Use any of the five schedule forms above before `script <name>`. The script must already exist and use a valid lowercase name. Names may repeat; `schedule system cancel <name>` removes every matching entry. `list` shows each name, schedule, next run, and runscript. An empty list or clear reports `No scheduled commands in system.`; a successful clear reports `Cleared <n> scheduled commands in system.`. A missing script reports `No runscript named "<name>".`; a script that can't be read safely reports `Could not read runscript "<name>".`. Other malformed system commands show `Usage: schedule system NAME <form> script <name> | schedule system list | schedule system cancel <name> | schedule system clear`.

`system` immediately after `schedule` is reserved for this project-level grammar. The `in <tab>` clause still targets a tab named `system` in ordinary tab schedules.

When a system schedule comes due, Janissary reads the script, starts the managed system shell if it isn't running, and adds every line of the script to the end of that shell's [command queue](/user-documentation/command-bar/queue#runscripts-in-the-system-shell) as one batch. It then posts `System schedule <name> ran: script <script>`, which means the lines are queued, not that they have finished. A failing line doesn't stop the lines after it, and no notice reports a single line's failure. Queued lines aren't saved, so a restart never replays work that was still waiting.

Three cases queue nothing. An empty script posts no `ran` notice. A missing script posts its [missing-script notice](/user-documentation/tab-types/notifications#system-schedule-notices). Both of those still count as that run, so a one-time schedule is spent and a recurring one moves to its next time. If the system shell can't start, the schedule stays due and tries again on a later check.

## Run a runscript now

Run a project runscript immediately with `execute <name>`:

```
execute deploy
```

The commands run in the project's managed system shell, even when you type the command from a workspaced shell. They share the system shell's FIFO with scheduled runs, and a failing line does not prevent later lines from running. All of a script's lines join the end of the queue as one batch, so another run can't slip lines in between them. Blank lines and lines starting with `#` are skipped. Manual runs do not create a schedule or a scheduled-run notice, and a successful run prints nothing. An empty script is a successful no-op.

Three replies mean nothing ran:

- `Usage: execute <name>` for a missing or invalid name. Names use lowercase letters and digits, with single hyphens between words.
- `No runscript named "<name>".` when no such script exists.
- `Could not read runscript "<name>".` when the script exists but can't be read.

If the system shell can't start, no lines are queued, and you get the usual `System shell could not start` notice.

Type `edit <name>` to open an existing runscript in the editor. An exact file target in your current working directory wins over the runscript. A missing bare name is not created automatically.

## Scheduling into another tab

<img class="agent-float left" src="/agents/selim-south-east.png" alt="" />

An `in <tab>` clause right after the name attaches the timer to a different tab:

```
schedule standup in bilal every day at 9:00 help
schedule list in claude
schedule cancel standup in claude
```

The timer belongs to the target tab. It appears in that tab's schedule window and fires there; your tab gets only the confirmation. You can name the target by its tab label or display alias, in any letter case. Harness tabs and plugin tabs that own a live terminal, including shell tabs, are valid targets. A due timer in a shell tab is typed into zsh just as if you had entered it at the terminal. The optional monitor tab for an autonomous `agent` run isn't schedulable. Other view tabs are refused with `Tab "<label>" cannot run scheduled commands.`, and a missing tab name returns `No tab named "<label>".` The `in <tab>` form is also the only way to manage a harness tab's timers, since a harness has no command bar of its own.

## How firing behaves

<img class="agent-float" src="/agents/ahmed-south-west.png" alt="" />

In a shell tab, the command is dispatched as if typed. The command dispatches immediately even when the agent is busy. It goes straight to the shell's terminal and doesn't wait in the shell's [command queue](/user-documentation/command-bar/queue). In a [harness tab](/user-documentation/advanced-agents/harness), the command is typed into the harness as a line of input — and if the harness isn't accepting input yet, the timer stays due and retries until it lands. After firing, a one-shot timer is removed; a recurring one advances to its next run.

A tab's timers live as long as the tab: closing it drops them, and no launch brings them back. The hidden `system` shell's own tab timers also end when its shell exits, even though its tab stays and a fresh shell starts at the project root. Project system schedules belong to the project, so they carry on.

A command delivered more than five seconds late posts `<command> ran <duration> late` to [notifications](/user-documentation/tab-types/notifications), with `(system was asleep)` appended when it missed its time because your machine was asleep. See [Sleep and resume](/user-documentation/getting-started/sleep-and-resume#overdue-scheduled-commands) for the rest of what happens to a timer while you're away.

Since launching a harness is an ordinary command, you can schedule one with a starting prompt too — wrap the whole [`harness … with <prompt>`](/user-documentation/advanced-agents/harness) command:

```
schedule deploy at 5pm harness claude with fix the failing tests
```

This opens a fresh harness tab at 5pm and feeds it that prompt as soon as it's ready.

## Seeing every schedule at once


`schedules` (plural) opens one tab that aggregates every scheduled command across every open tab and every project system schedule into a single list. Project system schedules sit in their own section above the tab-owned entries, and each section is ordered by next-to-run. Project system schedules appear even when the managed system shell isn't visible. The floating schedule window still shows only the active tab's own timers. There's only ever one schedules tab; a second `schedules` reuses it instead of opening another.

```
schedules         open (or focus) the aggregated list
schedules left    dock it in the left sidebar
schedules right   dock it in the right sidebar
```

![The aggregated schedules tab listing two timers with their owning tab, next-run time, spec, and command.](/screenshots/schedules-tab.png)

The tab has no command bar. Its header carries a **+** button that opens the New schedule dialog, described in [Scheduling from a dialog](#scheduling-from-a-dialog). Each row shows the owner, the timer's name, its timing, its next-run time, and the command it runs; system rows show `system` as the owner and `script <name>` as the command. Recurring entries are shown in the accent color, matching the schedule window. Docked into a sidebar, the list compresses to next-run time, name, and owner, dropping the command and spec to fit the narrower width. Each section has its own title and column headings, and rows are numbered continuously down the list. Either way the list updates live as timers fire and new ones are added — no need to reopen it — and shows "No scheduled commands." when no tab or project schedule exists. The tab has no clear button. To clear timers in bulk, run `schedule clear` in a tab to clear that tab's timers, or `schedule system clear` to clear the project system schedules.

Click a row to select it; double-click it, or press `Enter` with it selected, to jump to its owner. Focusing a system row reveals the managed system shell, or recovers it if needed, before showing it. `↑`/`↓` move the selection one row at a time, and `Home`/`End` jump to the first or last row. Pressing `Backspace` or `Delete` on a selected row opens a confirmation dialog — `Delete schedule "<name>"?` with **Delete** and **Cancel**. Each row also ends in a trash icon that opens the same dialog for that row. Confirming a tab-owned row cancels that timer in its owning tab, the same as `schedule cancel <name>` run there. Confirming a system row deletes only that schedule by its key; `schedule system cancel <name>` removes every system schedule with that name. Creating a schedule from this tab uses the **+** button. Editing a schedule still happens with the `schedule` command in the tab that owns it.

Like the [notifications feed](/user-documentation/tab-types/notifications), the schedules tab can dock into either sidebar and shares that sidebar with other dockable tabs rather than displacing them; while docked, a slim header above the list carries the **+** button and a button to cycle it to the other side.

## Scheduling from a dialog

In the web app, typing bare `schedule` — the word with nothing after it — opens a **New schedule** dialog instead of printing the `Usage:` message. (The terminal app still prints `Usage:` for a bare `schedule`.) The **+** button in the [schedules tab](#seeing-every-schedule-at-once) opens the same dialog.

The target dropdown lists eligible tabs and a separate **Project (system)** target. The managed system shell isn't listed as a tab target. The dialog defaults to the tab you're on, or to **Project (system)** when you're on the system shell. Opened from the schedules tab, it defaults to the first tab that can hold a schedule, since the schedules tab itself can't. An autonomous `agent` run's optional monitor tab isn't schedulable.

In tab mode, choose one of the five schedule forms above and enter the command to run. In **Project (system)** mode, choose an existing runscript instead of entering a command. For example, a runscript named `deploy` can be scheduled with `schedule system deploy at 5pm script deploy`. The picker lists valid `.rs` files from `.janissary/scripts/`. If none are available, it tells you to add a valid `.rs` file there and keeps **Schedule** disabled. If a script disappears while the dialog is open, choose another listed script before scheduling.

**Schedule** stays disabled until the name, the selected form's required value, and the command or runscript for the chosen target are filled in. Submitting is equivalent to typing the same `schedule` command by hand, so duplicate-name, parse, or missing-script errors use the normal command path. **Cancel** or `Escape` closes the dialog without scheduling anything. Clicking outside the dialog leaves it open. Your entries are remembered if you reopen the dialog later in the same session, including the command draft and runscript choice when you switch targets.

The dialog only creates new timers — manage existing ones with `schedule list` / `cancel` / `clear`, or the schedules tab above.
