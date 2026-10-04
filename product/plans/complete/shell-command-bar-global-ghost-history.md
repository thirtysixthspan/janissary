# Global ghost history in shell command bars

**Complexity: 4/10** — the shared key hook and command-bar chrome already support ghost text. The shell only needs the app-provided global history while keeping its own sent-line history for Up/Down recall.

## Goal

The shell command bar suggests and accepts completions from the same global command history as agent command bars. Its Up/Down navigation and `Ctrl+R` history remain local to lines sent by that shell.

## Approach

Extend the existing app-owned `AppCommandBar` context with the global history already received by `App.tsx`. The shell passes that history to `useCommandBarKeys` as `ghostHistory` and continues passing its sent lines as `history`. This reuses the matcher, display, and acceptance behavior without duplicating state or changing the plugin API contract.

## Implementation steps

1. Add `ghostHistory` to `AppCommandBar` in `web/src/shared/command-bar/AppCommandBar.tsx` and provide the current global history from `App.tsx`.
2. Pass `appBar.ghostHistory` as `ghostHistory` to `useCommandBarKeys` in `web/src/plugins/shell/ShellTab.tsx`; keep `sent` as the local recall history.
3. Extend `web/src/plugins/shell/ShellTab.test.tsx` to prove a command found only in global history appears as ghost text and ArrowRight accepts it into the shell bar without submitting it. Keep the existing local-history behavior covered.
4. Update `product/specs/shell-tab.md` to describe global ghost suggestions alongside shell-local recall.

## Tests

- `web/src/plugins/shell/ShellTab.test.tsx`: a prefix present only in app-provided global history renders the suggestion; ArrowRight accepts it without sending it to the shell; shell-local Up/Down history remains unchanged.
- Existing `web/src/shared/command-bar/useCommandBarKeys.test.tsx` acceptance and source-separation cases continue to pass.

## Out of scope

- Changes to ghost matching, rendering, key bindings, or global-history persistence.
- Changes to shell-local Up/Down recall or the `Ctrl+R` picker.
- Updates to public history documentation, which already states ghost suggestions use history across all tabs and runs, or `help.md`, which does not describe ghost text.
