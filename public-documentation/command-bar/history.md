# Command history

<img class="agent-float" src="/agents/hakim-south.png" alt="" />

Every command you run is remembered, and there are three ways back to one: the `↑`/`↓` arrows, ghost-text suggestions as you type, and the `Ctrl+R` picker. You can also click any past prompt line (`❯ <command>`) in the transcript to run it again immediately — drag-selecting its text still just copies.

## Arrow-key recall

`↑` walks backward through the current tab's history, most recent first; `↓` walks forward again. Stepping past the newest entry clears the input line. Each recalled command lands on the input line with the cursor at the end, ready to edit or run.

## Ghost text

When what you've typed is the prefix of a past command, the rest of the most recent match appears after the cursor as greyed ghost text:

![The command bar showing typed text continued by a greyed ghost-text suggestion.](/screenshots/ghost-text.png)

Press `→` or `End` at the end of your typed text to accept the whole suggestion. Any other key leaves it alone — keep typing and the suggestion narrows or disappears. Matching is case-sensitive, and ghost suggestions draw on your history from **all** tabs and previous runs, so a command you typed anywhere can complete everywhere.

## The `Ctrl+R` picker

`Ctrl+R` (or the `hist` command) opens a window listing the tab's recent commands, most recent at the bottom, just above the command bar:

![The history picker overlay listing recent commands above the command bar, with one row selected.](/screenshots/history-picker.png)

`↑`/`↓` move the selection, `Return` runs the selected command, `Escape` closes without running anything. A row can also be clicked. With no history yet, the window shows `(no history)`.

## What's kept, and where

<img class="agent-float left" src="/agents/tahir-south-east.png" alt="" />

History is per-tab: each tab records its own commands (up to 100; older entries fall off), and that's what arrow-key recall and the picker show. Running the same command twice in a row stores it once. Per-tab history persists with the agent's state, so it survives `janus --relaunch`.

There's also a global history spanning all tabs and all runs, capped at 1000 entries and stored in your home directory — that's what ghost text draws from. The split is deliberate: recall and the picker answer "what was I doing *in this tab*," while ghost text answers "how did I last type this command *anywhere*."
