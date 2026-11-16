# File patch 8: `applyPatchText` runner and its output lines

**Complexity: 5/10** — 12 requirements and 17 test scenarios from the escaping, period, and four failure-form rules drive it, with ~80 added lines across two new files and no existing files edited (p=5.46)

Run order: 8 of 15 in the `file patch` series. Source plan: `./product/plans/complete/file-patch.md`. Depends on `./product/plans/ready/file-patch-1-patch-section-parser.md`, `./product/plans/ready/file-patch-2-hunk-parser.md`, `./product/plans/ready/file-patch-3-hunk-applier.md`, `./product/plans/ready/file-patch-4-tree-view-entries.md`, `./product/plans/ready/file-patch-5-add-update-delete-sections.md`, `./product/plans/ready/file-patch-6-move-sections.md`, and `./product/plans/ready/file-patch-7-commit-and-restore.md`. None of their files exists in the repo yet (there is no `src/file-patch/` folder today); all seven must land first. This subplan depends on no later one.

This subplan joins the pieces into the one synchronous entry point that both a local tab and the far side of a remote tab will call, and it owns every line the patch prints. After it lands, a patch can be applied end to end against a temp directory in tests. No command reaches it yet.

## Goal

`applyPatchText(root, text)` in a new `src/file-patch/apply.ts` parses the text, builds a `PatchView` for `root`, applies the sections, commits, and returns one string: the success report or the failure line. It's synchronous, so local and remote output come from the same code.

## Design decisions

From the source plan:

- **Success.** A header `Patched <n> files:`, or `Patched 1 file:` for one, followed by one row per line in the order `applySections` returns them: `A <path>`, `M <path>`, `D <path>`, or `R <old> -> <new>`. Each path appears once with its net change. File content never appears. Paths are shown as typed and escaped with `displayPath` (`src/file-write/messages.ts`), like the write and edit lines.
- **Structural failure.** `Malformed patch at line <n>: <problem>. No files were changed.`, with `<problem>` from the parser (subplans 1 and 2).
- **Section failure.** `Patch failed at section <k> (<marker>): <reason>. No files were changed.`, for example `Patch failed at section 2 (Update File: src/a.ts): No matching text for hunk starting "const x = 1;". No files were changed.` A hunk mismatch's reason is `No matching text for hunk starting "<line>"`.
- **Failure while applying.** `Patch failed while applying: <reason>: <path>. No files were changed.` when the restore worked, and `Patch failed while applying: <reason>: <path>. Some files may have been changed.` when it didn't (subplan 7's two outcomes).
- **One line.** Every quoted line, path, and marker in a failure line is escaped with `displayPath`, so the output stays one line.
- **Atomicity.** Every check runs against the view before anything touches disk, so a parse failure or a section failure changes nothing.
- **Result.** On success, a per-file summary of created, modified, moved, and deleted files. On failure, an actionable line naming what went wrong (source plan's Result decision).

Decided here:

- **The pipeline.** `applyPatchText` runs, in order: `parsePatchText(text)` (subplans 1 and 2, `src/file-patch/parse.ts`); on `{ error }`, return the structural line. Otherwise `createPatchView(root)` (subplan 4, `src/file-patch/view.ts`), then `applySections(view, sections)` (subplans 5 and 6, `src/file-patch/sections.ts`); on `{ ok: false, … }`, return the section line. Otherwise `commitChanges(result.changes)` (subplan 7, `src/file-patch/commit.ts`), passing no `CommitOperations`, so the real `node:fs` calls run; on `{ ok: false, restored, reason, path }`, return the applying line. Otherwise return the success text built from `result.rows`. The rows are computed before the commit but printed only after it succeeds.
- **What each input looks like.** The structural line reads `PatchParseError` (`{ line, problem }`, subplan 1). The section line reads the failure member of `ApplySectionsResult` (subplan 5): `section` (1-based index), `marker` (`Add File: <path>`, `Delete File: <path>`, or `Update File: <path>`, unescaped, a Move section's marker included), and exactly one of `reason` (a finished reason string) or `hunkLine` (the unescaped quoted line). The success text reads `PatchRow[]` from `src/file-patch/rows.ts` (subplans 5 and 6): an `A`, `M`, or `D` row carries one typed path, an `R` row carries the old and the new typed path. The applying line reads the failure member of `CommitOutcome` (subplan 7): `restored`, `reason`, and the typed, unescaped `path`.
- **The hunk reason.** When the failure carries `hunkLine`, the reason is `No matching text for hunk starting "` + `displayPath(hunkLine)` + `"`. A `"` inside the line is not escaped (`displayPath` doesn't escape it), and an empty line gives `starting ""`; both stay one line.
- **What is escaped.** `displayPath` is applied to: each row path, both paths of an `R` row, the whole marker, the hunk line, the whole structural `<problem>` (subplan 1 leaves the quoted line in `unknown marker "<line>"` raw, so escaping the problem is what keeps that line one line), the section `<reason>`, the applying `<reason>`, and the applying `<path>`. Escaping a reason follows `reasonLine` in `src/file-write/outcome.ts`, which escapes reasons as well as paths; it changes nothing for the fixed reason strings and guards a `fileOperationReason` text.
- **Zero rows.** A patch whose sections all cancel out (an Add then a Delete of one path) prints `Patched 0 files:` with no rows. It still ran and committed nothing, which is accurate.
- **Joining.** The success text is the header and the rows joined with `\n`, no trailing newline, as `formatGlobResult` in `src/file-glob/command.ts` joins its lines. Numbers go into templates through `String(n)`, as `editSuccessLine` in `src/file-write/messages.ts` does.
- **Reason mapping.** A section reason or an applying reason equal to `OUTSIDE_ROOT_REASON` (`src/file-navigator/file-operation-result.ts`) is printed as `Outside the workspace`, as `mutationFailureLine` in `src/file-write/outcome.ts` does. Every other reason prints unchanged (then escaped). `resolveMutationTarget` already returns the literal `Outside the workspace` for an outside path (`checkLexicalPath` and `checkRealTarget` in `src/file-read/policy.ts`), so the mapping is a guard that is only reachable from a unit test of the line builder. `outcome.ts` keeps its `OUTSIDE_WORKSPACE` constant private and is not edited; `messages.ts` holds its own `Outside the workspace` literal.
- **Sentence periods.** A reason that already ends in `.` doesn't get a second one before ` No files were changed.`. One exported helper, `withFinalPeriod(text)` in `src/file-patch/messages.ts`, returns the text with a `.` appended unless it already ends in one; subplan 13 reuses it for `Patch failed: <reason>.`. It applies to the structural `<problem>` and the section `<reason>` only. In the applying form the period follows `<path>`, which always gets one, as `writeSuccessLine` and `reasonLine` do for paths. The check runs on the escaped text (escaping never adds or removes a trailing `.`).
- **Where the strings live.** Every patch output line is built in `src/file-patch/messages.ts`: the header, the rows, and the four failure forms. `apply.ts` only sequences the steps. That keeps both files small and gives the tests one place to read exact text from. The exported builders are `patchSuccessText(rows)`, `malformedPatchLine(error)`, `sectionFailureLine(failure)`, `applyingFailureLine(outcome)`, and `withFinalPeriod(text)`. The two endings `No files were changed.` and `Some files may have been changed.` are module constants there. `messages.ts` imports only types from `./parse.js`, `./sections.js`, `./rows.js`, and `./commit.js` (with `import type`), plus `displayPath` and `OUTSIDE_ROOT_REASON`; it never imports `./apply.js`, so `import-x/no-cycle` stays clean.
- **Root failures.** `applyPatchText` doesn't check `root` itself. A root that can't be resolved fails `resolveMutationTarget`'s `resolveRoot` with a `fileOperationReason` text, so the first section reports it as a section failure.
- **Thrown errors outside the commit.** `applyPatchText` doesn't catch errors from parse, view, or sections. Those return results, and a throw there is a bug that the callers' existing rejection handling reports (subplans 11 and 13). `commitChanges` never throws for an `fs` error (subplan 7), so no `try` is needed around it either.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How the runner uses it |
| --- | --- | --- |
| Path escaping | `displayPath` in `src/file-write/messages.ts` | Every path, marker, quoted line, problem, and reason. |
| Outside-root mapping | `mutationFailureLine` in `src/file-write/outcome.ts`; `OUTSIDE_ROOT_REASON` in `src/file-navigator/file-operation-result.ts` | Same mapping to `Outside the workspace`. |
| Reason escaping precedent | `reasonLine` in `src/file-write/outcome.ts` | Escapes the reason and the path, as the patch lines do. |
| Line joining precedent | `formatGlobResult` in `src/file-glob/command.ts` | Header and rows joined with `\n`. |
| Parser | `parsePatchText`, `PatchParseError` in `src/file-patch/parse.ts` (subplans 1 and 2) | First step; its error feeds the structural line. |
| View | `createPatchView` in `src/file-patch/view.ts` (subplan 4) | Built once per call for `root`. |
| Sections | `applySections`, `ApplySectionsResult` in `src/file-patch/sections.ts` (subplans 5 and 6) | Changes, rows, or the section failure. |
| Rows | `PatchRow` in `src/file-patch/rows.ts` (subplans 5 and 6) | `A`/`M`/`D` with one path, `R` with two. |
| Commit | `commitChanges`, `CommitOutcome` in `src/file-patch/commit.ts` (subplan 7) | Writes the changes; its failure feeds the applying line. |
| Temp-dir fixtures | `src/file-write/target.test.ts` (`mkdtempSync` under `tmpdir()` wrapped in `realpathSync`, `writeAt`, `truncateSync` for oversized files, `symlinkSync`) | Test setup pattern. |

## Proposed changes

- New `src/file-patch/apply.ts` with `applyPatchText(root: string, text: string): string`, the pipeline above and nothing else.
- New `src/file-patch/messages.ts` with the builders and constants above. Keep each function under the cognitive-complexity limit of 15; the file stays well under 200 lines with room for subplan 13's `patchRejectionLine`.
- Every relative import uses the `.js` extension, and there are no re-exports (the `export … from` ban in `eslint.config.mjs`). No existing file is edited.

## Tests

Both files are in the vitest `server` project.

New `src/file-patch/messages.test.ts`, calling the builders directly with hand-built values:

- `Patched 0 files:`, `Patched 1 file:`, and `Patched 2 files:` headers, and an `R` row printed as `R <old> -> <new>`.
- A row path, an `R` row's paths, a marker, a hunk line, a structural problem, and an applying path holding a newline or a tab come out escaped, and the whole result has no `\n` (the success text has exactly one `\n` per row).
- `withFinalPeriod` appends a `.` to a text without one and leaves a text ending in `.` alone; a section reason ending in `.` gives one period before ` No files were changed.`.
- A section reason equal to `OUTSIDE_ROOT_REASON` prints `Outside the workspace`.
- Both `CommitOutcome` failures: `restored: true` ends `No files were changed.`, `restored: false` ends `Some files may have been changed.`, each with the reason and the path.

New `src/file-patch/apply.test.ts` with temp-dir fixtures, end to end through `applyPatchText`. It covers the source plan's `apply.test.ts` list:

- A nested Add creates its parents and prints `A`. An Update prints `M`. A Delete prints `D`. A Move with hunks prints `R <old> -> <new>`.
- Delete-then-Add of one path prints `M`. Add-then-Delete prints no row, and alone gives `Patched 0 files:`.
- `Patched 1 file:` versus `Patched 2 files:`.
- Add on an existing path fails `File already exists`. Update and Delete of a missing path fail `File not found`.
- A later failing section leaves every earlier section unapplied on disk.
- Outside-root, `.git`, `.janissary`, directory, non-text, and over-5 MB targets fail with their reasons, each in the full `Patch failed at section <k> (<marker>): <reason>. No files were changed.` form.
- A Delete of a symbolic link removes the link only. An Update keeps permission bits. Emptied folders remain.
- A structural error prints `Malformed patch at line <n>: <problem>. No files were changed.` and changes nothing.
- A path and a quoted hunk line holding a newline or a tab are escaped, so the failure stays one line.
- A failure while applying, reached without injection through subplan 7's intermediate-hop collision (`a -> x/b`, `x/b -> c`, then Add `x`): the line starts `Patch failed while applying: `, ends `: x. No files were changed.`, and `a` is back. Assert the start and the end, not the platform's reason text.
- The source plan's manual scenarios 1 to 3, run against a temp dir holding `src/a.ts` (`const a = 1;` / `const b = 2;`), `old.txt`, and `src/x.ts`, with these exact expected outputs:
  1. The four-section patch from the source plan's Verification step 1 prints `Patched 4 files:`, `A notes/new/todo.md`, `M src/a.ts`, `R src/x.ts -> src/y.ts`, `D old.txt` in that order, and the tree matches.
  2. A patch whose first section adds `z.md` and whose second updates `src/a.ts` with a hunk of ` const a = 1;` then `-const b = 99;` prints `Patch failed at section 2 (Update File: src/a.ts): No matching text for hunk starting "const a = 1;". No files were changed.`, and `z.md` doesn't exist.
  3. `*** Delete File: ../outside.txt` prints `Patch failed at section 1 (Delete File: ../outside.txt): Outside the workspace. No files were changed.`

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- No manual check: no command reaches the runner until subplan 14.

## Out of scope

- The `file patch` command argument and usage line (subplan 9).
- Remote transport (subplans 10 to 12) and connection-failure lines (subplan 13), including `patchRejectionLine`, which subplan 13 adds to `src/file-patch/messages.ts`.
- Injected commit failures (subplan 7's `commit.test.ts` covers them; `applyPatchText` takes no `CommitOperations`).
