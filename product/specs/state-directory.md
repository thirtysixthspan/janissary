### State directory

Agent state is stored in `.janissary/state/`. Each agent has one JSON file named `<agent-name>.json` with fields: `name`, `dotColor`, `active`, `number` (the tab's position in the strip), `group` (the tab's group number) and `groupColor` (the group's fixed bar color — see Tab grouping), `cmdHistory[]`, `log[]` (the full transcript of commands and outputs), `cwd` (the shell working directory after the last command), `context[]` (informational messages received from other agents), and `workspaceDir` (path to the agent's disposable workspace clone).

Agent names are accepted by persistence whenever they are safe as a single filename — names containing path separators are rejected, everything else (including names with dots, such as `10.27.1.94`) saves and restores like any other.

On a normal `janus` launch the state directory and workspace directory are recursively deleted before rendering. On `janus --relaunch` the directories are preserved and all agent files are loaded to recreate tabs with their saved command history, transcripts, and working directories.

Closing a tab removes its agent-state file and its transcript record, so what `--relaunch` restores is the set of tabs that were open — not every tab that ever existed in the session. A tab closed deliberately stays closed. Quitting is different: it closes nothing, so every tab still open is persisted and comes back.

Work that finishes after its tab has closed — a shell command completing, a scheduled command firing — does not write that tab's state back. The tab is gone, and recreating its file would bring it back on the next relaunch. A tab name returned to the pool and reused by a new tab persists normally again.

The latest transcript for each tab is also maintained as a separate relaunch record. Each update
atomically replaces that record, so an interrupted or failed write leaves the previous valid
transcript intact. Persistence failures are reported as warnings, with repeated failures for the
same tab suppressed until a write succeeds.

The record is rewritten whenever an entry changes in place, not only when a new one is added. A command that finishes with no output (`cd`, `mkdir`, a silent script) and an inline terminal that exits are both saved as finished, so a relaunch never restores them as still running. That in-place change is not a new entry: the daily transcript log and any monitor watching the tab do not receive an exited terminal's command a second time.

### Remembered interactive commands

`.janissary/interactive-commands.json` holds the programs that were seen taking over the terminal, as a plain list. It is written when interactive detection promotes a command, read at startup, and merged with the built-in list of interactive programs so a program is recognized before it runs the next time (see `shell.md`). It sits alongside `config.json` rather than in `state/`, so it survives an ordinary launch; a malformed file is ignored and left untouched. Users edit it directly — delete an entry to forget one program, or the file to forget all of them.

Concurrent `janus` processes are only safe when targeting distinct directories. A PID lock file at `.janissary/lock` prevents two processes from sharing one directory at the same time, so the second process cannot clear state out from under the first. The lock refuses a recorded pid only when this user can still signal it, so two instances running under different accounts in one shared directory are both admitted — and the remote-sessions record file (see `sessions-tab.md`) is therefore named per account, `remote-sessions.<account-hash>.json`, with each instance writing only its own and a load merging every account's file into one list. The pre-keying `remote-sessions.json` is read the same way, so a parked session survives the upgrade untouched.
