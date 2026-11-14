# Align the file glob plans' link classification sentences with the link target rule

**Complexity: 1/10** — plan text only, 0 production lines or files, 3 requirements (p=2.56)

The link target check (`file-glob-walker-link-target-check.md`) made the walker classify a symbolic link to a file as `'link'` and drop it when its resolved target is a secret file, lies outside the workspace, or cannot be resolved. The canonical plan's Secret files decision and the 3.2 subplan's new "Link target check" decision say so, but other sentences in the same plans still say a link to a file classifies or lists exactly like a regular file. Later file glob subplans are written from these decisions and the canonical test list, so the unqualified sentences invite tests or help text that promise every link to a file is listed.

## Goal

No complete file glob plan says, without qualification, that a symbolic link to a file classifies as `'file'` or is always listed like a file. The canonical test list names a command-level case for an omitted link target.

## Approach

Verified against the code: `classify` in `src/file-glob/walk.ts` returns `'link'` for a symbolic link whose `stat` target is a file, and `record` drops a `'link'` match when `linkTargetAllowed` fails. The plans disagree with that in these places:

- `product/plans/complete/file-glob-3-sorted-walker-2-dirs-links-secrets-deadline.md`, the "Classification with `stat`" decision ("A file target classifies as `'file'`") and the matching requirement bullet ("A link to a file counts as a file").
- `product/plans/complete/file-glob.md`, the "Symbolic links" decision ("A symbolic link to a file is listed like a file") and the walker implementation note ("a link to a file counts as a file").
- `product/plans/complete/file-glob.md`'s `src/file-glob/glob.test.ts` test list names only "a symlink to a file that is listed".
- Missed by this repair and qualified by the follow-up `file-glob-plan-link-listing-qualification.md`: `product/plans/complete/file-glob-3-sorted-walker.md`'s symbolic link decision ("A link to a file counts as a file"), its classify helper description ("classifies one `Dirent` as file, directory, or skip"), and its Tests bullet ("a symbolic link to a file is listed"); the 3.2 subplan's opening summary ("so a link to a file is listed") and its `walk-modes.test.ts` bullet ("a symbolic link to a file is listed in file mode"); and `product/plans/complete/file-glob.md`'s "Files or directories" decision ("regular files and symbolic links to files").

Edit plan text only. Each qualification points at the rule already stated in the Secret files decision and the "Link target check" decision rather than restating it differently.

## Implementation steps

1. In the 3.2 subplan, change the "Classification with `stat`" decision so a file target classifies as `'link'`, judged further by the link target check below, and qualify the "A link to a file counts as a file" requirement the same way.
2. In `file-glob.md`, qualify the "Symbolic links" decision and the walker implementation note: a link to a file is listed like a file unless its resolved target is a secret file, lies outside the workspace, or cannot be resolved, as the Secret files decision states.
3. In `file-glob.md`'s `glob.test.ts` list, add "a symlink to a secret file or to a file outside the workspace that is omitted" beside "a symlink to a file that is listed".

## Tests

None: no code or test changes. The walker's link target behavior is already covered by the tests added with `file-glob-walker-link-target-check.md`. `$janissary/scripts/run.mjs check-diff` must stay green.

## Out of scope

- Any change to `src/file-glob/` or its tests.
- The draft subplans 4–9 and user-facing specs and help: no spec or help page describes `file glob` yet.
