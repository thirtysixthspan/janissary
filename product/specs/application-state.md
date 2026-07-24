On a normal launch the state directory is cleared before the UI renders, so every session starts fresh.

The `--relaunch` flag skips the state directory cleanup and instead loads all existing agent state files, recreating a tab for each agent with its saved command history, full transcript log, and shell working directory. If no state files are found, a single `janus` tab is created as the default.

Only agent tabs are persisted and restored this way. View tabs — image, page, markdown, editor, file navigator, monitor, and notifications (see `tabs.md`) — are live, in-memory views that are never saved and never recreated on `--relaunch`.
