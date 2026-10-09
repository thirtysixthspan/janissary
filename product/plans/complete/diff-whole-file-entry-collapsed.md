# Fix: open a whole-file change collapsed, expanded by a double-click

**Complexity: 4/10** — one new pure predicate module, per-entry expansion state on an existing component, a hint row, its stylesheet rule, and the tab's rendering tests. No server, protocol, parser, or wire-shape change.

## Goal

An entry whose change holds no surviving line — a file added, a file deleted, or a file rewritten with nothing of the old content left — opens collapsed, showing only its header, and a double-click on the header expands it to the whole file. A further double-click collapses it again.

## Approach

The payload already carries everything the rule needs: a whole-file change is a record whose hunk lines are all on one side with no context line, because git only prints a context line where something survived. `DiffFile.hunks` therefore decides the rule on the client with no new wire field, and binary and mode-only records hold no hunks and so never match.

1. **A pure predicate.** `web/src/plugins/diff/whole-file.ts` exports `isWholeFileChange(file: DiffFile): boolean` — at least one hunk line, and none of them a context line. New files are all added, deleted files all removed, and a full rewrite is both with nothing between.
2. **Per-entry expansion state.** `FileEntry` holds `open` state, starting collapsed, and renders its hunks only while `isWholeFileChange(file)` is false or the entry is open. A double-click on the header toggles it. The name button keeps opening the file on its first click, so the second click of a double-click is dropped there — a double-click expands rather than opening the file twice.
3. **The collapsed affordance.** While collapsed, a `.diff-whole-file` note beside the counts says the entry holds the whole file and how to open it, so the state is not a silent blank. `diff.css` gives the note the muted color the tab already uses for quiet text.

## Implementation steps

1. Add `web/src/plugins/diff/whole-file.ts` with `isWholeFileChange`.
2. Hold the expansion state in `web/src/plugins/diff/FileEntry.tsx`, render the note and the toggle, and keep the name button's open-on-click.
3. Add the `.diff-whole-file` rule to `web/src/plugins/diff/diff.css`.
4. Run `./scripts/run.mjs check-diff` and resolve any failures.
5. Extend `web/src/plugins/diff/DiffTab.test.tsx` with the cases below.
6. Run `./scripts/run.mjs check-diff` and resolve any failures.
7. Update `product/specs/diff-tab.md` with the collapsed-entry behavior and the walk's crossing of it.
8. Check `help.md` and `documentation/user-documentation/` for entry-layout guidance, and update it only if present.

## Tests

- An entry whose every line is added renders no line rows until its header is double-clicked, and then renders them all.
- The same entry collapses again on a second double-click.
- An entry whose every line is removed — a deleted file — also opens collapsed and expands on a double-click.
- An entry holding context lines, the ordinary change, renders its rows without a double-click.
- A double-click on a whole-file entry's header opens its file at most once, so the gesture expands rather than re-opening the editor.

## Out of scope

- The size cap and note a very large file carries, which the other recorded entry requests.
- Expanding the entry the keyboard walk lands on, and any change to which hunks the walk counts.
- Syntax highlighting.
