# List directories last in the task and profile pickers

**Complexity: 2/10** — the task picker's row order is produced by a single sort in the server-side walk of `ai/tasks/`; the profile picker already has no directory rows to order.

## Goal

In the task picker, show a directory's task files before its subdirectories at every level, so the files a user picks most often sit at the top of each section and the expandable subdirectories collect at the bottom. Names stay alphabetical within each of the two groups.

The profile picker lists only `profiles/*.json` files — it never renders a directory row — so "directories last" already holds there and no behavior changes.

## Approach

- Sort each directory's entries files-first, then directories, each group alphabetical, in the recursive walk that builds the task rows. Because the walk emits a directory immediately followed by its descendants, this single comparator change reorders every level at once and leaves the pre-order invariant (and the client's expand/collapse, depth, and header logic) untouched.
- Leave the client's flattening, key handling, and rendering alone — the client renders whatever order the server sends.
- Confirm the profile listing yields no directory rows and lock that in with a test, rather than adding directory support to profiles.

## Implementation steps

1. Change the entry comparator in `src/tasks.ts` so files sort ahead of directories, keeping `localeCompare` within each group.
2. Update `src/tasks.test.ts` for the new order and add coverage for files-before-directories at the top level and inside a nested directory.
3. Add a `src/profiles.test.ts` case asserting a subdirectory inside `profiles/` produces no row, so the picker's "no directories" property is guarded.
4. Re-point the `task-picker` documentation screenshot fixture in `scripts/docs-screenshots/manifest.mjs`: with directories last, the initial selection lands on a file, so the keystrokes must step down to a directory row before expanding it.
5. Update `product/specs/task-picker.md` (listing order) and `product/specs/profiles.md` (picker lists files only).
6. Update the user documentation page for the task picker if it states the listing order.
7. Promote this plan to complete and remove only the fixed backlog line.

## Tests

- `src/tasks.test.ts`: a directory row sorts after the sibling task files; a nested directory sorts after its sibling files; existing recursion, depth, shadowing, and section tests updated to the new order.
- `src/profiles.test.ts`: a subdirectory under `profiles/` is not listed as a profile row.

## Out of scope

- Adding subdirectory support (or directory rows) to profiles.
- Changing the sort in any other picker — file navigator, quick open, history, queue, tab navigator.
- Changing which section (Project / Janissary) comes first, or the shadowing rules between them.
- Making the order configurable.
