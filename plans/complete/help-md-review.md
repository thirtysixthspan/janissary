# Review help.md for correctness and comprehensiveness

## Issue

"review the code and specs to assure the help.md file is correct and comprehensive."

Cross-referenced `help.md` against the actual key bindings and command implementations. The command descriptions are all accurate. The Key Bindings table has gaps.

## What's missing

### help.md Key Bindings — add these entries

- `Ctrl+G` — Open the fuzzy tab navigator (also closes it if already open)
- `Cmd+W / Ctrl+W` — Close the current tab
- `Cmd+T` — Open a new agent tab (rooted at the project directory)
- `Page Up` / `Page Down` — Scroll the transcript up / down by half terminal height
- `Escape` — Reset scroll to bottom
- `Cmd+F` — Open the search bar in the transcript

### specs/keyboard-navigation.md — missing Ctrl+A

- `Ctrl+A` — Open the task picker

## Changes

1. `help.md` — add the 6 missing key binding rows to the Key Bindings table
2. `specs/keyboard-navigation.md` — add Ctrl+A to the key bindings table
3. `src/commands.test.ts` — update the help content test to check for any newly added key binding (already tests for Ctrl+E, just add Ctrl+G)

## Verification

- `./scripts/run.mjs check-diff` passes

