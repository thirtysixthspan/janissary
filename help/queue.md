### queue

Queue a command for a shell or another tab that supports command queues. Bare `queue` opens the interactive queue picker.

**Usage**

`queue <tab> <command>`

`queue`

**Use cases**

- Send work to a busy shell or queued-command tab.
- Queue lines for a shell that is still preparing its workspace.
- Review or edit queued commands.

**Examples**

- `queue janus npm test` queues `npm test` for the `janus` tab.
- `queue` opens the queue picker.

**Notes**

- The target is one word: a tab label or display alias, in any letter case. An alias with spaces can't be used.
- The picker opens only over a tab that has both a queue and a command bar. On any other tab, bare `queue` and `Ctrl+E` do nothing.
- Missing arguments print `Usage: queue <shell-tab> <command>`. An unknown tab prints `No tab named "<label>".`. A tab without a queue prints `Tab "<label>" has no command queue.`.
