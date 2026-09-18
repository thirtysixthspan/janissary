# Relaunch

(`janus --relaunch`)

1. Preserve `.janissary/state/` directory.
2. List all `.json` files in the state directory. A tab closed during the previous session left no file behind, so the listing is the tabs that were still open (see `state-directory.md`).
3. Sort the saved agents by their recorded tab `number` and create a tab for each, preserving its saved `number` and `dotColor`.
4. Load each agent's `cmdHistory` and `log` into its tab, and populate the cwd ref for shell restoration.
5. If no state files exist, fall back to a single `janus` tab.
6. Reattach every recorded remote session, opening its tabs as each peer answers (see `remote-server.md`). Each is attempted independently and none holds the restore up: a peer that refuses is marked ended, and a host that cannot be reached leaves its session listed as detached with the failure on its row. An ordinary `janus` start does not do this — it lists those sessions as detached and waits for the button in the sessions tab.
7. Render the UI with all restored tabs.
8. When a shell is spawned for a restored tab, `cd` to the saved working directory.

### Restored tab order

Each tab's `number` is recorded in its state file and kept in sync as tabs are created, reordered (`Ctrl+←`/`Ctrl+→`), or renumbered. On `--relaunch`, tabs are rebuilt in ascending `number` order and each tab keeps its previously assigned `number`, dot color, and group (`group` number and `groupColor` bar color), so the tab strip — including its group bands — reappears exactly as it was left. State files predating these fields fall back to array order with palette-assigned colors and group 1.

