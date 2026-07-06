On a normal launch the state directory is cleared before the UI renders, so every session starts fresh.

The `--relaunch` flag skips the state directory cleanup and instead loads all existing agent state files, recreating a tab for each agent with its saved command history, full transcript log, and shell working directory. If no state files are found, a single `janus` tab is created as the default.
