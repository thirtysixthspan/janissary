# Make `hist` in a shell tab open the same history as Ctrl+R

**Complexity: 3/10** — In a shell tab, `Ctrl+R` opens the tab's own history popup, which lists the lines its command bar has sent. A bare `hist` goes through the application's bare-word interception instead and opens the application's history picker, which lists the active tab's server-side history; a shell tab's command line never writes there, so that picker is empty.

## Goal

Submitting `hist` from a shell tab's command bar opens the same history popup, with the same content, as `Ctrl+R`.

## Approach

Recognize a bare `hist` in the shell tab's command-line rules, matched the way the application's bar matches its bare words, and have the shell submit path open the tab's own history popup for it before offering the line to the application. The line is not recorded, so the list matches what `Ctrl+R` shows.

## Implementation

1. Add `opensShellHistory` to the shell command-line rules.
2. Give the shell submit hook an `openHistory` callback and call it for a bare `hist` ahead of the application's interception.
3. Pass the callback from the shell tab, opening its history popup.
4. Update the shell-tab spec and the shell user documentation.

## Tests

- `opensShellHistory` accepts `hist` in any case and spacing and rejects `hist` with an argument, `!hist`, and other words.
- Submitting `hist` in a shell tab opens the shell history popup listing the lines already sent, opens no application picker, and dispatches nothing.

## Out of scope

- The application's history picker in other tabs.
- Writing shell command-bar lines into the server-side tab history.
