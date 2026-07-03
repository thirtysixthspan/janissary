# Scheduling

The `schedule` command (parsed by `parseScheduleCommand` in `src/schedule.ts`, dispatched by `src/commands/schedule.ts`) queues commands to run later in a tab — the issuing agent's tab by default, or another tab named with an `in <tab>` clause. Each tab owns its schedule; agent entries are stored in the `schedule` array of the agent's state file (`.janissary/state/<name>.json`) and survive `--relaunch`. Harness tabs can hold schedules too, but theirs live in memory only (harness tabs have no persisted agent state) and end when the tab closes.

### Schedule forms

| Form | Meaning |
|---|---|
| `schedule at <time> <cmd>` | One-shot at a clock time today, or the next day if that time has already passed. |
| `schedule on <date> [at <time>] <cmd>` | One-shot at a calendar date; the time defaults to 9:00am when omitted; rolls to next year if the date has passed. |
| `schedule every <N><m\|h\|d\|w> <cmd>` | Recurring at a fixed interval (minutes/hours/days/weeks); first run is one interval from now. |
| `schedule every day at <time> <cmd>` | Recurring every day at a clock time. |
| `schedule every <weekday> at <time> <cmd>` | Recurring on a named weekday (`monday`…`sunday`) at a clock time. |

Times accept `3:35pm`, `2pm`, or 24-hour `14:00`; dates accept `august 12th`, `aug 12`, or `8/12` (month names match by ≥3-character prefix). The first token after `schedule` (unless it is the reserved `list`, `cancel`, or `clear`) is the timer's name, which becomes the entry's id — so it appears in the schedule window and `schedule cancel <name>` works — and the remainder is the schedule form. A duplicate name within a tab is rejected; a name with no valid following schedule form returns the `Usage:` message.

### Targeting another tab

An optional `in <tab>` clause immediately after the timer name (`schedule NAME in TAB <form> COMMAND`) attaches the entry to the named tab instead of the issuing tab. The entry is stored under the target tab's label, so it appears in *that* tab's schedule window and view, persists in *that* agent's state file, and fires in *that* tab — the issuing tab only records the confirmation message (`Scheduled <name> in <tab>: …`). Valid targets are agent tabs and harness tabs; image/page/markdown views are rejected with `Tab "<label>" cannot run scheduled commands.`, and a missing tab with `No tab named "<label>".` Duplicate-name checks apply within the target tab. Tab-completion (`completeScheduleTarget` in `src/completion-handlers.ts`) completes the label after `in` against all open tab labels.

### Management

`schedule list` prints the agent's entries (`<name>  <spec>  (next: <when>)  <command>`), or `No scheduled commands.` when empty. `schedule cancel <name>` removes one entry (reporting `No scheduled command "<name>".` if absent). `schedule clear` removes all entries for the agent. Each management form accepts a trailing `in <tab>` to operate on another tab's schedule (`schedule list in claude`, `schedule cancel standup in claude`, `schedule clear in claude`) — the only way to manage a harness tab's timers, since harnesses cannot run commands. A malformed invocation returns a `Usage:` message and does not modify the schedule.

### Firing

A single one-second interval (`ScheduleManager` in `src/schedule-manager.ts`) drives all tabs. On each tick, for every **open** tab, entries whose `nextRun` is at or before now are fired; delivery depends on the tab's kind. In an agent tab, `<command> ## scheduled ##` is dispatched through the normal command handler targeted at that tab, so the command runs and is recorded exactly as if typed there. In a harness tab, the raw command is typed into the harness PTY as a line of input (`ptyInput(harness.ptyId, command + '\r')`, like `send`); if the harness is not running yet (or has exited), the entry stays due and delivery retries on a later tick. After a firing, a one-shot entry is removed; a recurring entry's `nextRun` is advanced (`computeNextRun`: interval → now + interval; clock time → next matching occurrence). After any schedule change in a tick, the state is re-emitted so the schedule window in the web UI updates to show the new next-run times. A firing for an agent that is not currently open as a tab is skipped, leaving the entry in the state file to fire the next time that agent is open and due.

### Schedule window

While the active agent has at least one scheduled entry, a small titled `schedule` window (`ScheduleWindow` in `src/ScheduleWindow.tsx`) floats at the top-right, stacked directly below the connection window (its `top` offset is computed in `src/cli.tsx` from the connection window's rendered height). It lists one line per timer — `<id>  <spec>  (next: <when>)` — with recurring timers drawn in the accent color and one-shots in the foreground color. The window is hidden whenever the active agent's schedule is empty. Its body lines are produced by the pure `scheduleLines` helper, mirroring `ConnectionWindow`'s `statusLines`.

In the web app the same panels are `StatusPanels` (`web/src/StatusPanels.tsx`). On a harness tab the schedule panel floats over the top-right of the harness terminal (rendered `scheduleOnly` — no connections panel, since the whole tab is the terminal connection), with pointer events disabled so it never intercepts terminal input.

### `schedule` command

`schedule` queues a command for later execution in the issuing agent's tab, or in another tab via `in <tab>`. See the Scheduling section. Every scheduled command is named by the first token after `schedule`. Forms: `schedule <name> [in <tab>] at <time> <cmd>` (one-shot today/next day), `schedule <name> [in <tab>] on <date> [at <time>] <cmd>` (one-shot date), `schedule <name> [in <tab>] every <N><m|h|d|w> <cmd>` (recurring interval), `schedule <name> [in <tab>] every <day|weekday> at <time> <cmd>` (recurring clock time), plus `schedule list [in <tab>]`, `schedule cancel <name> [in <tab>]`, and `schedule clear [in <tab>]`. Malformed invocations return a `Usage:` message.
