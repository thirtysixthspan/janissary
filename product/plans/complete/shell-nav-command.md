# Make `nav` open the tab navigator from a shell tab

**Complexity: 3/10** — `nav` and `nav <query>` open the fuzzy tab navigator from an agent tab because the agent bar's own submit chain checks for them after the shared interception. A plugin tab's bar runs only the shared interception, so in a shell tab `nav` was offered to the server and never opened anything.

## Goal

`nav` and `nav <query>` submitted from a shell tab's command bar open the tab navigator on that query, and close it when it is already open, exactly as from an agent tab.

## Approach

Move the `nav` handling into the shared `useAppCommandLine` interception that every command bar runs, rather than adding a second copy to the shell tab. A pure `navCommandQuery` beside the bare-word classifier reads the query. The interception toggles the navigator with the `navOpen`, `setNavOpen`, and `openTabNavWithQuery` it already receives, and reports the tab that opened it as the bare-word openers do. The agent bar's own branch is removed, since the interception now answers for it.

## Implementation

1. Add `navCommandQuery` to the command-bar submit classifier.
2. Handle `nav` in `useAppCommandLine` after the existing verdicts.
3. Remove the `nav` branch from the agent tab's `useCommandBarSubmit`.
4. Update the shell-tab spec.

## Tests

- `navCommandQuery` reads `nav` with and without a query, in any case and spacing, and ignores words that merely start with `nav`.
- The shared interception opens the navigator on the query and reports the source tab, and closes it when it is already open.
- A shell tab submitting `nav docs` opens the navigator on `docs` and sends nothing to the server or zsh.

## Out of scope

- The navigator's own keyboard handling and rendering, which already work over a shell tab through `Ctrl+G`.
