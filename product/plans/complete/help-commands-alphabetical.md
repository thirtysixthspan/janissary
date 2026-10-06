# Help command table in alphabetical order

**Complexity: 1/10** — a reorder of one markdown table, a test that keeps it ordered, and a line of guidance. No source change.

The backlog asks to "sort the command in the help documentation alphabetically" and to "add guidance in /ai/guidance/documentation.md to note that this list should be maintained in alphabetical order." The list is the **Commands** table in `help.md`, which `help` and `help commands` print. Its rows were in the order commands were added (`help`, `clear`, `quit`, `close`, `agent`, …), so finding a command meant reading the whole table.

There is no `ai/guidance/` directory. The project's binding guidance lives in `ai/guidelines/`, and `ai/guidelines/documentation.md` is the file the issue names, so the guidance goes there.

## Goal

The help command table lists commands alphabetically by name, a row added out of order fails the suite, and the contributor guidance says to keep it that way.

## Approach

**Sort by the command's name, not the whole cell.** A row's name is the first word inside its first backticks: `newfile <file>` sorts as `newfile`. Names compare case-insensitively. Row text is unchanged; only the order moves.

**Enforce it with a test rather than vigilance.** A test reads the table through `help commands` — the same text users see — extracts each row's name, and asserts the list equals its sorted copy. The guidance then points at a rule the suite already checks.

**Put the guidance where the issue says.** `ai/guidelines/documentation.md` is otherwise about character sprites in the user docs, so the rule gets its own short section naming `help.md`'s command table and the name it sorts by.

## Implementation steps

1. **Sort the Commands table rows in `help.md`** by command name.
2. **Add the ordering test** to `src/commands.test.ts`.
3. **Add a "Help command table" section** to `ai/guidelines/documentation.md`.
4. **State the order in the spec**: the `help` section of `product/specs/application-commands.md`.

## Tests

In `src/commands.test.ts`:

- The names in the `help commands` table, read in order, equal the same names sorted alphabetically, and there is more than one of them.

## Out of scope

- **Sorting the key-binding tables.** Those are grouped by tab and ordered by how keys relate, and the issue names only the command list.
- **The user documentation's command tables**, which are grouped by topic across several pages.
