# Qualify the remaining file glob plan sentences that list every link to a file

**Complexity: 1/10** — plan text only, 0 production lines or files, 6 requirements (p=2.95)

The link classification alignment repair (`file-glob-plan-link-classification-alignment.md`) qualified the sentences its own Approach enumerated, but its Goal is not met. Other complete file glob plans still say, without qualification, that a symbolic link to a file counts as a file, classifies as a file, or is listed. The shipped walker classifies such a link as `'link'` and drops it when the link target check finds its resolved target is a secret file, lies outside the workspace, or cannot be resolved. An agent writing a later file glob subplan or help text from these plans could still read a promise that every link to a file is listed.

## Goal

No complete file glob plan says, without qualification, that a symbolic link to a file counts as a file, classifies as a file, or is listed. Every remaining occurrence of "link to a file" or "symlink to a file" in `product/plans/complete/file-glob*.md` is either qualified by the link target check or describes a specific in-workspace test fixture.

## Approach

Verified against the code: `classify` in `src/file-glob/walk.ts` returns `'link'` for a symbolic link whose `stat` target is a file, and `record` drops a `'link'` match when `linkTargetAllowed` fails. A grep of `product/plans/complete/file-glob*.md` for "link to a file", "links to files", "symlink to a file", "symbolic link", and "as a file" found these unqualified sentences:

- `product/plans/complete/file-glob-3-sorted-walker.md`, the symbolic link design decision: "A link to a file counts as a file."
- `product/plans/complete/file-glob-3-sorted-walker.md`, the `walkGlob` helper description: one helper "classifies one `Dirent` as file, directory, or skip (doing the single `stat` for a symbolic link)", which implies a link to a file classifies as a file.
- `product/plans/complete/file-glob-3-sorted-walker.md`, the Tests bullet: "a symbolic link to a file is listed".
- `product/plans/complete/file-glob-3-sorted-walker-2-dirs-links-secrets-deadline.md`, the opening summary: "classifies symbolic links with one `stat` so a link to a file is listed".
- `product/plans/complete/file-glob-3-sorted-walker-2-dirs-links-secrets-deadline.md`, the `walk-modes.test.ts` bullet: "a symbolic link to a file is listed in file mode and not in `dirs` mode".
- `product/plans/complete/file-glob.md`, the "Files or directories" decision: "By default only files are listed (regular files and symbolic links to files)."

Occurrences left unchanged, because they are already qualified, describe the pre-fix behavior being repaired, name an in-workspace test fixture, or say only that links to files are tested against the pattern rather than listed:

- The 3.2 subplan's requirement bullet, "Classification with `stat`" decision, and "Link target check" decision; `file-glob.md`'s Secret files decision, Symbolic links decision, walker implementation note, and `glob.test.ts` list (qualified by the earlier repair).
- "links to files are tested" in the pre-split plan and "links to files are tested alongside regular files" in the 3.2 subplan (testing against the pattern happens before the link target check).
- The Problem paragraph of `file-glob-walker-link-target-check.md` (describes the bug it fixed) and its "a link to an in-root file" test bullet; the `lists a symbolic link to a file in file mode only` test name cited in `file-glob-walker-root-realpath-fail-soft.md` (an in-workspace fixture).
- Quotations of the old sentences inside `file-glob-plan-link-classification-alignment.md`'s Approach list.

The pre-split subplan 3 predates the link target check, so its qualifications carry a short parenthetical saying the check was added later by `file-glob-walker-link-target-check.md`. Edit plan text only.

## Implementation steps

1. In `file-glob-3-sorted-walker.md`, change "A link to a file counts as a file." to say a link to a file counts as a file unless its resolved target is a secret file, lies outside the workspace, or cannot be resolved, noting the link target check was added later by `file-glob-walker-link-target-check.md`.
2. In the same plan, change the classify helper description so a link to a file classifies as a link that the link target check judges further.
3. In the same plan, change the Tests bullet to "a symbolic link to an in-workspace, non-secret file is listed".
4. In the 3.2 subplan, change the opening summary's "so a link to a file is listed" to say a link to a file is listed unless the link target check drops it.
5. In the 3.2 subplan, change the `walk-modes.test.ts` bullet to "a symbolic link to an in-workspace file is listed in file mode and not in `dirs` mode".
6. In `file-glob.md`, qualify the "Files or directories" decision's parenthetical so symbolic links to files are listed subject to the Secret files decision.
7. Add these places to `file-glob-plan-link-classification-alignment.md`'s Approach list, noting they were qualified by this follow-up.
8. Re-run the grep and confirm every remaining occurrence is qualified or an in-workspace fixture.

## Tests

None: no code or test changes. The walker's link target behavior is already covered by the tests added with `file-glob-walker-link-target-check.md`. `$janissary/scripts/run.mjs check-diff` must stay green.

## Out of scope

- Any change to `src/file-glob/` or its tests.
- The draft subplans 4–9, user-facing specs, and help: no spec or help page describes `file glob` yet.
