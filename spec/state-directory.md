### State directory

Agent state is stored in `.janissary/state/`. Each agent has one JSON file named `<agent-name>.json` with fields: `name`, `dotColor`, `active`, `number` (the tab's position in the strip), `group` (the tab's group number) and `groupColor` (the group's fixed bar color — see Tab grouping), `cmdHistory[]`, `log[]` (the full transcript of commands and outputs), `cwd` (the shell working directory after the last command), `context[]` (informational messages received from other agents), and `workspaceDir` (path to the agent's disposable workspace clone).

On a normal `janus` launch the state directory and workspace directory are recursively deleted before rendering. On `janus --relaunch` the directories are preserved and all agent files are loaded to recreate tabs with their saved command history, transcripts, and working directories.
