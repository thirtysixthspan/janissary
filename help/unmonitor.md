### unmonitor

Stop a monitor, remove a target from a monitor, or stop all monitors started from the current tab. A tab target can use its label or display alias, matched case-insensitively.

**Usage**

`unmonitor <name>`

`unmonitor <name> [<tab-or-alias>|group:<n>]`

`unmonitor --all`

**Use cases**

- Stop monitoring when it is no longer needed.
- Remove one tab or group from a monitor's targets.
- Stop all monitors started from the current tab.

**Examples**

- `unmonitor bilal` stops the monitor named `bilal`.
- `unmonitor bilal agent2` removes the tab with the label `agent2` as a target.
- `unmonitor bilal reviewer` removes the tab with the display alias `reviewer` as a target.
- `unmonitor bilal group:3` removes group 3 as a target.
- `unmonitor --all` stops all monitors started from this tab.
