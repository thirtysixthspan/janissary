# Scheduling

The `schedule` command (parsed by `parseScheduleCommand` in `src/schedule.ts`, dispatched by `src/commands/schedule.ts`) queues commands to run later in the issuing agent's tab. Each agent owns its schedule; entries are stored in the `schedule` array of its state file (`.janissary/state/<name>.json`) and survive `--relaunch`.

### Schedule forms

| Form | Meaning |
|---|---|
| `schedule at <time> <cmd>` | One-shot at a clock time today, or the next day if that time has already passed. |
| `schedule on <date> [at <time>] <cmd>` | One-shot at a calendar date; the time defaults to 9:00am when omitted; rolls to next year if the date has passed. |
| `schedule every <N><m\|h\|d\|w> <cmd>` | Recurring at a fixed interval (minutes/hours/days/weeks); first run is one interval from now. |
| `schedule every day at <time> <cmd>` | Recurring every day at a clock time. |
| `schedule every <weekday> at <time> <cmd>` | Recurring on a named weekday (`monday`…`sunday`) at a clock time. |

Times accept `3:35pm`, `2pm`, or 24-hour `14:00`; dates accept `august 12th`, `aug 12`, or `8/12` (month names match by ≥3-character prefix). The first token after `schedule` (unless it is the reserved `list`, `cancel`, or `clear`) is the timer's name, which becomes the entry's id — so it appears in the schedule window and `schedule cancel <name>` works — and the remainder is the schedule form. A duplicate name within an agent is rejected; a name with no valid following schedule form returns the `Usage:` message.

### Management

`schedule list` prints the agent's entries (`<name>  <spec>  (next: <when>)  <command>`), or `No scheduled commands.` when empty. `schedule cancel <name>` removes one entry (reporting `No scheduled command "<name>".` if absent). `schedule clear` removes all entries for the agent. A malformed invocation returns a `Usage:` message and does not modify the schedule.

### Firing

A single one-second interval (`useScheduler` in `src/useScheduler.ts`) drives all agents; it reads from refs so idle ticks cause no re-render. On each tick, for every **open** tab, entries whose `nextRun` is at or before now are fired by dispatching `<command> ## scheduled ##` through the normal command handler targeted at that tab (`createCommandHandler` accepts a target tab index), so the command runs and is recorded exactly as if typed there. A one-shot entry is then removed; a recurring entry's `nextRun` is advanced (`computeNextRun`: interval → now + interval; clock time → next matching occurrence). A firing for an agent that is not currently open as a tab is skipped, leaving the entry in the state file to fire the next time that agent is open and due.

### Schedule window

While the active agent has at least one scheduled entry, a small titled `schedule` window (`ScheduleWindow` in `src/ScheduleWindow.tsx`) floats at the top-right, stacked directly below the connection window (its `top` offset is computed in `src/cli.tsx` from the connection window's rendered height). It lists one line per timer — `<id>  <spec>  (next: <when>)` — with recurring timers drawn in the accent color and one-shots in the foreground color. The window is hidden whenever the active agent's schedule is empty. Its body lines are produced by the pure `scheduleLines` helper, mirroring `ConnectionWindow`'s `statusLines`.

### `schedule` command

`schedule` queues a command for later execution in the issuing agent's tab. See the Scheduling section. Every scheduled command is named by the first token after `schedule`. Forms: `schedule <name> at <time> <cmd>` (one-shot today/next day), `schedule <name> on <date> [at <time>] <cmd>` (one-shot date), `schedule <name> every <N><m|h|d|w> <cmd>` (recurring interval), `schedule <name> every <day|weekday> at <time> <cmd>` (recurring clock time), plus `schedule list`, `schedule cancel <name>`, and `schedule clear`. Malformed invocations return a `Usage:` message.
