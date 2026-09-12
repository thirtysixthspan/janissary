# Correct the default-branch comment's remote-tree claim

**Complexity: 2/10** — two comment blocks, in one source file and one completed plan file. No code, no tests, no behavior change. The number is not lower because the comment being corrected makes two claims that are wrong in opposite directions, and the replacement has to state the real reason remote trees stay out of the sync gate rather than simply deleting the false one.

Work item, verbatim: *"Correct the default-branch field's doc comment, which states a remote-tree classification the classifier does not implement."*

The comment on `GitMetadata.defaultBranch` in `src/file-navigator/filesystem-port.ts` says the field is "Absent for a remote tree". It is not: `RemotePort.gitMetadata` spreads the far side's reply verbatim, so a remote tree forwards whatever that host resolved for its own workspace. The completed plan file goes further and claims an absent field "classifies as unconfirmed and therefore unsynced", which `isPrimaryBranch` contradicts outright — an absent detected default falls back to exact membership in `master`/`main`, so an absent default with `master` checked out classifies as *primary*.

That comment sits on the one field the sync gate's branch decision is built from, so a reader reasoning about whether a tree can enable syncing takes the fallback's direction backwards. And the containment that actually keeps remote trees out of the gate rests on path shape, not on the classification the comment claims.

## Design decisions

- **The comment states what the code does, including the fallback's direction.** The field carries `origin/HEAD`'s name when the resolving host can determine it; absent means "not determinable here", and `isPrimaryBranch` reads that as a cue to fall back to the `master`/`main` pair — not as a cue to refuse syncing.
- **The real reason remote trees stay out of the gate is written down as such.** A remote file is materialized under `<projectDir>/.janissary/remote-files/` by `remote-file-cache.ts`, so it does not match a launch-dir-relative sync path. That is a statement about path shape, and it is load-bearing, so it belongs in the comment in place of the classification claim it replaces.
- **The completed plan is corrected, not annotated.** Its record should not assert a behavior the merged code does not have. The bullet on `GitMetadata` is rewritten in place; nothing else in that file changes, since the rest of it describes what shipped.
- **No behavior change and no new tests.** The existing `isPrimaryBranch` cases in `src/git/status.test.ts` already pin the `master`/`main` fallback the corrected comment describes, including the row added when the vacuous branch-gate tests were replaced.

## Proposed changes

- `src/file-navigator/filesystem-port.ts` — the comment on `GitMetadata.defaultBranch` is rewritten to say: the field carries `origin/HEAD`'s name when the resolving host can determine it; a remote tree reports whatever its own host resolved for its workspace, rather than nothing; an absent value does not mean unsynced, because `isPrimaryBranch` falls back to exact membership in `master`/`main`; and remote trees stay out of the sync gate because their files are materialized under `.janissary/remote-files/` and so never match a launch-dir-relative sync path.
- `product/plans/complete/disable-git-sync-off-primary-branch.md` — the `GitMetadata` bullet's claim that an absent field "classifies as unconfirmed and therefore unsynced" is replaced with the classification the merged code actually has, keeping the bullet's description of where the value is resolved and which port has to satisfy the widened type.

## Tests

None. Comment-only; the classifier behavior the comments describe is already covered by `src/git/status.test.ts`'s `isPrimaryBranch` block.

## Out of scope

- Making remote trees unconfirmable by classification rather than by path shape. The current containment is real, and narrowing it would be a behavior change with its own risk — a sync-paths entry broad enough to cover the remote-file cache directory would still reach the gate with a remote tree's branch, and that remains true after this work.
- Changing `RemotePort.gitMetadata`'s verbatim forwarding of the far side's reply.
- Any change to `isPrimaryBranch` or its fallback.

## Verification

- `./scripts/run.mjs check-diff`
