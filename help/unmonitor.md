### unmonitor

Stop a monitor, remove a target from a monitor, or stop all monitors started from the current tab.

**Usage**

`unmonitor <name>`

`unmonitor <name> <target>`

`unmonitor --all`

**Use cases**

- Stop monitoring when it is no longer needed.
- Remove one tab or group from a monitor's targets.
- Stop all monitors started from the current tab.

**Examples**

- `unmonitor bilal` stops the monitor named `bilal`.
- `unmonitor bilal janus` removes `janus` as a target.
- `unmonitor --all` stops all monitors started from this tab.
