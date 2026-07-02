# Command History

Per-tab recall of previously entered commands.

### Per-tab history

Each tab stores its own command history array and navigation index. Switching tabs exposes that tab's history.

### History navigation

The Up arrow walks backward through the history (most recent first). The Down arrow walks forward. Past the newest entry, the input line clears. Each recalled entry is placed on the input line with the cursor at its end.

### Click to execute

Clicking any prompt line (`❯ <command>`) in the transcript immediately executes that command again, as if it were typed into the command bar and Enter was pressed. Drag-selecting text on a prompt line still copies to the clipboard and does not trigger execution. ACP prompt lines (agent tool steps) keep their collapse-toggle click behavior.

### Ghost text suggestion

As the user types in the command bar, if the typed text is a prefix of a past command in that tab's history, the remainder of the most recent matching entry appears after the cursor as greyed ghost text. Pressing → (ArrowRight) or End with the cursor at the end of the typed text accepts the suggestion, replacing the input with the full entry and moving the cursor to its end, exactly as if it had been recalled from history. Any other key leaves the ghost text alone: typing further either re-derives a new suggestion or removes it, and → or End pressed anywhere other than the end of the typed text keeps its normal cursor-movement behavior. Matching is case-sensitive and exact-prefix; a typed string identical to a history entry shows no ghost, since there is nothing left to suggest.

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
