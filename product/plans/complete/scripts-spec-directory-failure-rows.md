# Scripts spec names the directory fault in the read and delete failure lines

**Complexity: 2/10** — a spec-only correction. The code already does what the revised spec describes, so no source, test, or documentation file changes. The one judgment is which of the two honest fixes to take.

## Goal

Make `product/specs/scripts-tab.md` say which fault produces the `Could not read runscript "<name>".` and `Could not delete runscript "<name>".` lines. Each line has a file fault and a directory fault, and the spec named only the file fault. This run changes no behavior and no verbatim string.

## Problem

The claim was checked by reading the code on `feature/scripts-tab` (PR #1739). No test asserts the Run, Open, or Delete line under a symlinked directory.

- `readRunscript` in `src/schedule/system/runscript-files.ts` calls `scriptsDirectory`, which calls `inspectScriptsDirectory`. That runs `assertDirectory` on `.janissary` and then on `.janissary/scripts`. `assertDirectory` throws when the path is a symlink or not a directory. Only a missing path returns false, so the throw comes before the runscript file is looked at.
- `runRunscriptNow` in `src/commands/execute.ts` returns the read line on any throw from `readRunscript`. The Run action in `src/plugins/runscript-topic-actions.ts` posts that line. The `execute <name>` command calls the same function, so it reaches the line too.
- `openOne` in `src/plugins/runscript-topic-actions.ts` turns the throw into the read line.
- `deleteOne` in the same file turns the throw from `deleteRunscript` into the delete line. `deleteRunscript` calls `readRunscript` first, so the directory throw reaches it.
- `cloneOne` turns the same throw into the clone line. `newUntitledRunscript` turns it into the create line with the name `untitled`. The spec already covers both.

So Run, Open, and Delete reach their read and delete lines whether or not the runscript file exists. The directory case is reachable at any time through `execute <name>`, and through a row still on screen before the next refresh drops it.

The delete row also misses a file fault. `readRunscript` reads the file's text before `deleteRunscript` removes it. A regular file that exists but cannot be read therefore makes Delete report the delete line. The table's delete trigger names a symlink, a non-regular file, or a failed removal, and leaves out the unreadable file. Correcting that row is part of making each row name its fault, so it is included here.

## Decision

Take the spec correction. The other honest option was to treat the two lines as misleading for a directory fault, leave the code alone, and record the wording for the owner. Rejected for this run. The lines are accurate about the outcome, since the runscript cannot be read or deleted. What the spec lacks is the cause, and the spec is where the cause belongs.

The owner may still want a line that names the directory. Recorded here for that choice: the line text does not name the directory, so a reader sees the same words for both faults. A distinct wording is a code change and needs its own entry. This run does not make it.

## Changes

### `product/specs/scripts-tab.md`

- Failure table. The trigger cells of the `Could not read runscript "<name>".` row and the `Could not delete runscript "<name>".` row each name the file fault, then add a directory clause: "Also when `.janissary` or `.janissary/scripts` is a symlink or not a directory, whether or not the file exists." The delete row's file fault also names an unreadable file. The text column and the "Produced by" column do not change, and no verbatim string changes.
- Edge cases. One bullet is added directly after the symlinked-directory bullet. It says Run and Open report the read line and Delete reports the delete line, whether or not the runscript file exists. It says the directory is checked first, so those lines do not mean the file is at fault. It notes that Duplicate already reports its clone line in that case.

### Plan and backlog

- This plan moves `draft/` to `ready/` to `complete/`.
- The first entry in `product/backlog/pull-request.md` is removed whole. The second entry stays byte for byte.

## Tests

None added. The change is to a spec and changes no behavior. The existing docs tests in `src/commands.test.ts` and `src/plugins/documentation.test.ts` run unchanged, and `check-diff` gates the change.

## Spec

`product/specs/scripts-tab.md` is the only spec changed, as described above.

## Docs

None needed. `help.md` and `documentation/user-documentation/` describe no change in behavior, and no user page covers these failure lines.

## Out of scope

- Any change to the read or delete wording, or to the code that produces those lines. That is the owner's call, recorded under Decision.
- A test that asserts the Run, Open, or Delete line under a symlinked directory, or the Delete line for an unreadable file. The scope is the spec, so that is a possible follow-up.
- The Duplicate row is left as written. Its trigger, "The source is refused", already fits the directory case, and the new bullet names the clone line for it.
- The second entry in `product/backlog/pull-request.md`, which concerns the six-topic count and stays as it is.
