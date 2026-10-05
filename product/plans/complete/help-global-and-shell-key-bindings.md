# Split help's key bindings into a global section and a shell tab section

**Complexity: 2/10** — `help.md`'s **Key Bindings** table mixes chords that work in every tab with the command bar's and agent tab's own keys, and the shell tab's keys are scattered through it as parentheticals (`Ctrl+R`, `Cmd+T`, `Shift+Tab`, a `(shell tab)` row for `Ctrl+C`/`Ctrl+D`/`Ctrl+Z`) while several are missing entirely — terminal scrolling, `Escape`, ghost acceptance, the `!` prefix, the queue popup. Two rows are also wrong for a shell tab: `Ctrl+E` is described as a no-op outside agent tabs, though it opens the queue popup over a shell tab, and the shell-tab spec repeats that stale claim.

## Goal

`help` shows a **Global key bindings** table holding only the chords that work from every tab, a table for the command bar and agent tab, and a **Shell tab controls** table, beside the existing per-tab sections, that lists every key a shell tab handles. Every row matches what the code does.

## Approach

Restructure the `### Key Bindings` section of `help.md` in place, keeping its heading (the `help` command's test looks for it) and the existing per-tab sections. Move the window-level chords — tab switching and moving, the pickers, Quick Open, project search, close, new tab, section cycling — into the global table, with a one-line pointer where a tab's own controls take the key. Leave the command bar and transcript keys in their own table. Add the shell tab table, written from the shell-tab spec and the code. Correct the stale `Ctrl+E` sentence in the shell-tab spec.

## Implementation

1. `help.md`: replace the single key table with **Global key bindings** and **Command bar and agent tab** tables, and add **Shell tab controls** after them.
2. `product/specs/shell-tab.md`: `Ctrl+E` opens the queue popup over a shell tab; only `Cmd+F` does nothing there.

## Tests

- `src/commands/commands.test.ts`: `help` lists the global section and the shell tab section.

## Out of scope

- The user documentation's keyboard pages.
- Changing any key's behavior.
