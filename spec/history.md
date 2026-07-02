# Command History

Per-tab recall of previously entered commands.

### Per-tab history

Each tab stores its own command history array and navigation index. Switching tabs exposes that tab's history.

### History navigation

The Up arrow walks backward through the history (most recent first). The Down arrow walks forward. Past the newest entry, the input line clears. Each recalled entry is placed on the input line with the cursor at its end.

### Click to pre-fill

Clicking any prompt line (`❯ <command>`) in the transcript copies that command into the command bar, ready to re-run or edit. The pre-fill replaces whatever text is currently in the input, resets the history navigation index, and parks the cursor at the end of the text. Drag-selecting text on a prompt line still copies to the clipboard and does not trigger pre-fill. ACP prompt lines (agent tool steps) keep their collapse-toggle click behavior.

### History picker

`Ctrl+R` (or the `hist` command) opens the history window listing the tab's recent history entries, ordered with the most recent at the bottom (nearest the command line); it is anchored to the bottom, spanning the width just above the command input. Up/Down move the selection, Return runs the selected command, and Escape closes the overlay without running anything. The window opens whenever `hist` / `Ctrl+R` is invoked; when there is no history yet it shows a `(no history)` placeholder.

### Consecutive duplicate suppression

If a command matches the last entry in the tab's history, it is not appended again.

### History cap

History is capped at 100 entries per tab. Older entries beyond the cap are dropped from the front.

### History on return

Pressing Return saves the trimmed input to history before executing.

### Persistence

Command history is persisted per-agent to `.janissary/state/<name>.json`. Each agent state file stores `name`, `dotColor`, `active`, `number` (the tab's position), `cmdHistory[]`, `log[]` (the full transcript), `cwd` (the shell's working directory), and `context[]` (informational messages received from other agents).
