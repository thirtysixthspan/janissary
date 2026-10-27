### schedule

Schedule a command to run later in a tab, or manage project runscripts with a system schedule.

**Usage**

`schedule <name> <form> <command>`

`schedule system <name> <form> script <name>`

**Use cases**

- Run a tab command at a later time or on a recurring schedule.
- Schedule a project runscript.

**Examples**

- `schedule standup every 1h acp Summarize progress` schedules a recurring tab command.
- `schedule system deploy at 5pm script deploy` schedules a project runscript.
