### State directory

Agent state is stored in `.janissary/state/`. Each agent has one JSON file named `<agent-name>.json` with fields: `name`, `dotColor`, `active`, `number` (the tab's position in the strip), `group` (the tab's group number) and `groupColor` (the group's fixed bar color — see Tab grouping), `cmdHistory[]`, `log[]` (the full transcript of commands and outputs), `cwd` (the shell working directory after the last command), `context[]` (informational messages received from other agents), and `workspaceDir` (path to the agent's disposable workspace clone).

On a normal `janus` launch the state directory and workspace directory are recursively deleted before rendering. On `janus --relaunch` the directories are preserved and all agent files are loaded to recreate tabs with their saved command history, transcripts, and working directories.

The latest transcript for each tab is also maintained as a separate relaunch record. Each update
atomically replaces that record, so an interrupted or failed write leaves the previous valid
transcript intact. Persistence failures are reported as warnings, with repeated failures for the
same tab suppressed until a write succeeds.

### Remembered interactive commands

`.janissary/interactive-commands.json` holds the programs that were seen taking over the terminal, as a plain list. It is written when interactive detection promotes a command, read at startup, and merged with the built-in list of interactive programs so a program is recognized before it runs the next time (see `shell.md`). It sits alongside `config.json` rather than in `state/`, so it survives an ordinary launch; a malformed file is ignored and left untouched. Users edit it directly — delete an entry to forget one program, or the file to forget all of them.

Concurrent `janus` processes are only safe when targeting distinct directories. A PID lock file at `.janissary/lock` prevents two processes from sharing one directory at the same time, so the second process cannot clear state out from under the first.
