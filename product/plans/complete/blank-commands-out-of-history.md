# Keep blank commands out of command history

**Complexity: 2/10** — A command made only of whitespace should never become a history entry. The shell tab appends to its history from three places — a bar line it ran, a bar line it queued, and a command zsh reports from the terminal — each with its own `[...previous, line]`, so whether a blank line is kept out depends on every caller having trimmed it first, and a command typed into the terminal is kept with whatever spaces surrounded it. The application's global history guards its writes, but it loads `history.json` without looking at the commands inside, so a blank entry already in the file (from an older build or an edit) is offered by the history picker and the ghost suggestions.

## Goal

No history surface — the shell tab's own history, the agent tab's history, or the global history behind the picker and ghost suggestions — holds a command that is empty or only whitespace, and a shell-tab entry carries no leading or trailing whitespace.

## Approach

Give the shell tab one `appendShellHistory(previous, line)` that trims the line and leaves the list unchanged when nothing is left, and make all three append sites use it. In the global history, drop blank commands both when the file is read and when an entry is appended, so the rule holds at the file boundary rather than only at today's callers. The agent tab's per-tab history already drops a command that is blank after comment stripping, which stays as it is.

## Implementation

1. New `web/src/plugins/shell/shell-history.ts` with `appendShellHistory`.
2. Use it in `useShellSubmit` (`remember`), `useTerminalCommandHistory` (`onCommand`) and `ShellTab` (queued lines).
3. `src/global-history.ts`: treat an entry whose command is blank as not a history entry when reading, and never append one.
4. Update the shell-tab spec's history paragraph and the history spec's global-history rules.

## Tests

- `shell-history.test.ts`: appends a trimmed line; leaves the list untouched for an empty, whitespace-only or newline-only line.
- `ShellTab.test.tsx`: a whitespace-only command reported by the terminal adds nothing; a padded one is recalled trimmed.
- `src/global-history.test.ts`: blank commands in `history.json` are not loaded; recording a blank command writes nothing.

## Out of scope

- Collapsing repeated commands in the shell tab's history.
- How a multi-line entry is displayed in the history list.
