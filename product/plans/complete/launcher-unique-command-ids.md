# Make every launcher command id name exactly one row

**Complexity: 4/10** — one uniqueness pass over the decoded entries, one problem line that names the reason a row is missing, and tests for both halves of the collision.

`toCommands` in `src/plugins/launcher/commands-file.ts` numbers an entry `command-${index}` when the file names no id, and otherwise keeps the id the file gave. Nothing checks the result. Two consequences, both from the same root: `run-command` in `src/plugins/launcher/activate.ts` resolves an id with `state.commands.find((candidate) => candidate.id === payload.id)`, which answers the **first** row holding it, and the rail keys a row by `entry.id`. So two rows sharing an id look different and behave identically — a click on the second runs the first's command, and React has two children with one key.

The collision needs no contrived file. An explicit `"id": "command-1"` — a natural thing to write when numbering by hand — lands on the id an entry at index 1 with no id of its own gets for free, and the generated one, being found first depending on order, wins or loses by accident.

## Goal

Every id in the decoded rail names exactly one row, the file's own naming wins, and a file that would produce duplicates says so instead of shipping two rows that only look different.

## Approach

1. **`src/plugins/launcher/commands-file.ts`** decodes the entries into drafts carrying the id the file named, then assigns ids in two passes:
   - the explicit ids first, in file order, because they are the user's own naming. A second row naming one already claimed is dropped, rather than left looking clickable;
   - then the positional ids for what the file left unnamed, each yielding to anything already taken rather than displacing a name the user wrote.
2. The reporting is the same one line the file already produces. Ambiguity is named on its own rather than folded into "not usable", because the reason a row the user wrote is missing is otherwise invisible: every entry in the file may be well-formed and two of them still cannot both hold one id.
3. `readLauncherFile` keeps its other refusal paths exactly as they are — invalid JSON, an unreadable file, a non-list, an empty array — and its default-set fallbacks.

### Rejected alternatives

- Rejecting the whole file when any two ids collide. One duplicated id costs one row, and the rest of a user's rail is still theirs; the fallback would throw away a working file over a typo.
- Renaming a duplicate to a fresh id and keeping both rows. The rows would then be distinct while doing the same thing by two names, which is the confusion the check exists to remove — and the user asked for one row.
- Minting ids the file cannot influence, such as a hash of the command line. It would make `run-command`'s validation untestable from a committed file and break every existing project's file in flight.

## Implementation steps

1. Split `toCommands` into a draft decoder and an id assignment.
2. Replace the three tail branches of `readLauncherFile` with one computed problem line.
3. Add the tests below and run `./scripts/run.mjs check-diff`.

## Tests

- `src/plugins/launcher/commands-file.test.ts`: two entries naming the same id keep the first and drop the second, with a line naming what was wrong.
- An explicit `command-1` and an unnamed entry at index 1 do not collide: the explicit row keeps its name and the unnamed one takes a free one.
- The existing cases keep their meaning — positional numbering, a malformed entry dropped with its line, an empty array reporting nothing, and the default set on every refusal.
- `src/plugins/launcher/activate.test.ts`: a click on the second of two rows that once shared an id cannot run the first row's command, because only one of them survives the read.

## Spec updates

- `product/specs/launcher.md`: an id names exactly one row; a file naming the same id twice keeps the first and says so.

## Out of scope

- Whether the rail should show the dropped row greyed out. The payload carries what may run, and the problem line is how the loss is said.
- Reserving ids for entries the file removed. A dropped row's id is simply free again.
