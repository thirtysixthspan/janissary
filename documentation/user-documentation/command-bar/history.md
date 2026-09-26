# Command history

<img class="agent-float" src="/agents/ahmed-south.png" alt="" />

Every command you run is remembered, and there are three ways back to one: the `↑`/`↓` arrows, ghost-text suggestions as you type, and the `Ctrl+R` picker. You can also [double-click a past prompt line](/user-documentation/getting-started/tabs#reading-the-transcript) (`❯ <command>`) to run it again. On an ordinary prompt line a single click does nothing, and drag-selecting its text still just copies. A prompt line belonging to an agent's tool steps is the exception: a single click folds it away or brings it back, the same as `Ctrl+T`.

## Arrow-key recall

`↑` walks backward through the current tab's history, most recent first; `↓` walks forward again. If you've already typed a command before pressing `↑`, stepping forward past the newest history entry restores that unexecuted text instead of losing it. Each recalled command and restored draft lands on the input line with the cursor at the end, ready to edit or run. The draft you started from is never itself remembered: it neither joins the tab's history nor shows up in the `Ctrl+R` picker, and it isn't offered as ghost text either.

If what you've typed spans more than one line — whether from `Shift+Enter` or from a long line wrapping — `↑`/`↓` move the cursor between those lines first. Recall only kicks in once the cursor is already on the input's first line (for `↑`) or last line (for `↓`).

## Ghost text

When what you've typed is the prefix of a past command, the rest of the most recent match appears after the cursor as greyed ghost text:

![The command bar showing typed text continued by a greyed ghost-text suggestion.](/screenshots/ghost-text.png)

Press `→` or `End` at the end of your typed text to accept the whole suggestion. Any other key leaves it alone — keep typing and the suggestion narrows or disappears. A suggestion only appears when there is something left to suggest, so typing a command that is already in history in full shows no ghost text. Matching is case-sensitive, and ghost suggestions draw on your history from **all** tabs and previous runs, so a command you typed anywhere can complete everywhere.

## The `Ctrl+R` picker

`Ctrl+R` (or the `hist` command) opens a window listing the tab's recent commands, most recent at the bottom, just above the command bar:

![The history picker overlay listing recent commands above the command bar, with one row selected.](/screenshots/history-picker.png)

`↑`/`↓` move the selection, `Return` runs the selected command, `Escape` closes without running anything. A row can also be clicked. With no history yet, the window shows `(no history)`.

## What's kept, and where

<img class="agent-float left" src="/agents/aslan-south-east.png" alt="" />

History is per-tab: each tab records its own commands (up to 100; older entries fall off), and that's what arrow-key recall and the picker show. Running the same command twice in a row stores it once. Per-tab history persists with the agent's state, so it survives `janus --relaunch`.

What gets stored is the command with its `##` comment removed, so `ls ## check the log` is remembered as `ls` and the comment never reaches history. The same stripped text is what runs, so the comment is dropped either way.

There's also a global history spanning all tabs and all runs, capped at 1000 entries and stored in your home directory — that's what ghost text draws from. The split is deliberate: recall and the picker answer "what was I doing *in this tab*," while ghost text answers "how did I last type this command *anywhere*."

Global-history updates replace the stored file atomically, so an interrupted or failed write leaves the previous valid history available. If the file is malformed or cannot be read or written, the server log reports `warning: global command history unavailable: <reason>` once. Repeated failures stay quiet until a read or write succeeds; a later failure can then report a fresh warning. A history file that exists but can't be read is never overwritten: commands you type are still remembered for ghost text during that run, but the file is left as it is so you can repair it.

Several janus instances can run at once and share the global history. Each update re-reads the file and adds to what's there, so commands typed in one instance aren't erased by another, and ghost text picks up commands another instance recorded.
