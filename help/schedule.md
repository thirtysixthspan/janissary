### schedule

Create or manage a tab's timers, or schedule an existing project runscript.

**Usage**

`schedule <name> [in <tab>] at <time> <command>`

`schedule <name> [in <tab>] on <date> [at <time>] <command>`

`schedule <name> [in <tab>] every <N><m|h|d|w> <command>`

`schedule <name> [in <tab>] every day at <time> <command>`

`schedule <name> [in <tab>] every <weekday> at <time> <command>`

`schedule list [in <tab>]`

`schedule cancel <name> [in <tab>]`

`schedule clear [in <tab>]`

`schedule system <name> at <time> script <runscript>`

`schedule system <name> on <date> [at <time>] script <runscript>`

`schedule system <name> every <N><m|h|d|w> script <runscript>`

`schedule system <name> every day at <time> script <runscript>`

`schedule system <name> every <weekday> at <time> script <runscript>`

`schedule system list`

`schedule system cancel <name>`

`schedule system clear`

**Use cases**

- Run a tab command at a later time or on a recurring schedule.
- Target another tab's schedule by its label or display alias with `in <tab>`; omit it to use the issuing tab.
- List, cancel, or clear timers for the issuing tab or a named tab.
- Schedule, list, cancel, or clear project-owned schedules that run existing runscripts and persist across restarts.
- System schedules and runscripts survive launch cleanup in `.janissary/system-schedules.json` and `.janissary/scripts/`. In a Git project, Janissary adds either path to the clone's `.git/info/exclude` when Git does not already ignore it; it never edits `.gitignore`. If Git already tracks the schedule file or a runscript, saving a system schedule fails with `Could not save system schedule.`
- For one-shot schedules, `at <time>` uses the next occurrence of that time, and `on <date>` defaults to 9:00am when no time is given.
- A time that is now or earlier rolls to the next day. A date that has passed this year rolls to next year.
- Month and weekday names need at least three letters, so `aug` and `mon` work.
- Recurring schedules accept an interval in minutes, hours, days, or weeks, or a daily or weekday time.
- The first word is the timer's name. `list`, `cancel`, `clear`, and `system` can't be names, and names are case-sensitive.
- The `in <tab>` target is one word, so an alias that contains a space can't be targeted.
- A bad value gets its own reply: `Invalid time: "<token>".`, `Invalid date. Try "on august 12th" or "on 8/12".`, `Invalid interval or day: "<token>".`, or `No command to schedule.`
- System schedules use an existing runscript instead of a free-form command.
- A system schedule that came due while Janissary was closed is reported as missed and does not run.

**Examples**

- `schedule standup every day at 9am /standup` schedules a recurring command in the issuing tab.
- `schedule deploy in reviewer at 5pm npm run deploy` schedules a command in the tab named `reviewer`.
- `schedule list in claude` lists timers in the `claude` tab.
- `schedule cancel standup in claude` cancels that tab's `standup` timer.
- `schedule clear in claude` removes all timers from the `claude` tab.
- `schedule system nightly at 5pm script deploy` schedules the existing `deploy` runscript for the project.
- `schedule system list` lists project-owned schedules.
- `schedule system cancel nightly` cancels project schedule `nightly`.
- `schedule system clear` removes all project-owned schedules.
