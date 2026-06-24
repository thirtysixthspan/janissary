# Relaunch

(`janus --relaunch`)

1. Preserve `.janissary/state/` directory.
2. List all `.json` files in the state directory.
3. Sort the saved agents by their recorded tab `number` and create a tab for each, preserving its saved `number` and `dotColor`.
4. Load each agent's `cmdHistory` and `log` into its tab, and populate the cwd ref for shell restoration.
5. If no state files exist, fall back to a single `janus` tab.
6. Render the UI with all restored tabs.
7. When a shell is spawned for a restored tab, `cd` to the saved working directory.

### Restored tab order

Each tab's `number` is recorded in its state file and kept in sync as tabs are created, reordered (`Ctrl+←`/`Ctrl+→`), or renumbered. On `--relaunch`, tabs are rebuilt in ascending `number` order and each tab keeps its previously assigned `number`, dot color, and group (`group` number and `groupColor` bar color), so the tab strip — including its group bands — reappears exactly as it was left. State files predating these fields fall back to array order with palette-assigned colors and group 1.

