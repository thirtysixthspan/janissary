### send

Deliver a line to another tab. A shell tab submits it through that tab's command bar, where application commands run in the app and other lines go to zsh.

**Usage**

`send <tab> <command>`

**Use cases**

- Submit a command to another tab without switching to it.
- Send input to a shell or harness tab.

**Examples**

- `send janus npm test` submits `npm test` to the `janus` shell tab.
- `send claude Summarize the changes` sends a line to the `claude` tab.
