# Qualify the file help page's read-only notes

**Complexity: 1/10** — no production code (help text only), 3 requirements, 2 scenarios (p=2.96)

## Goal

Make the `help file` page say which subcommand its shared notes describe, so the `file read` defaults, output, and errors no longer appear to apply to `file glob`, whose `--limit` counts paths, defaults to 100, and caps at 1000.

## Approach

Documentation-only change to `help/file.md`. The paragraph after the **Usage** list, the **Output** lead sentence, and the **Errors** lead sentence name `file read` explicitly, and the Usage paragraph points to **Finding files** for `file glob` and **Writing and editing** for `file write` and `file edit`. No command behavior changes. A regression test pins the qualified wording through the `help file` output.

## Implementation steps

1. In `help/file.md`, reword the paragraph after the **Usage** list to start "For `file read`, …" and add a sentence pointing to **Finding files** and **Writing and editing**.
2. Reword the **Output** lead to "`file read` prints each line with its line number." and the **Errors** lead to "Each `file read` failure prints one line that names the path as you typed it:".
3. Add a test in `src/commands.test.ts` that reads `help file` and checks the qualified sentences and the glob limit wording.

## Tests

- `help file` contains the `file read`-qualified Usage paragraph with the 2000 default, the pointer to **Finding files**, the qualified Output and Errors leads, and the glob `--limit` sentence with 1 to 1000 and the default of 100.
- No unqualified "`--limit` is the number of lines to print" sentence remains.

## Out of scope

- Any change to `file read`, `file glob`, `file write`, or `file edit` behavior.
- Restructuring the page into per-subcommand sections, and changes to other help pages or specs (the `acp.md` spec already scopes each default to its command).
