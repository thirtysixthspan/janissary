# Correct the pull request description's file list

**Complexity: 1/10** — two edits to one section of the pull request body. No code, no test.

## Summary

The description's **Files changed** section names `shared/context-menu` as the home of the new context-menu entry, its
anchor capture, and the published `pasteTextInto`. No such path exists. The code is in
`web/src/context-menu/default-menu-target.ts` and `web/src/context-menu/useDefaultContextMenu.ts` — a feature
directory, not under `web/src/shared/`, which matters because this pull request adds lint boundaries that put the two
sides of that line on opposite sides of a rule.

The same section lists `web/src/overlay-plugins/chords.ts` twice: once for the chord ids and `eventChordId`, then again
for the reason `eventChordId` exists.

## Design decisions

### This is a description edit, not a code edit

The remedy is prose in the pull request body, applied after the branch is pushed, so a failure between the two cannot
leave the pull request describing work that is not on its branch. Nothing in the tree changes, so there is no plan to
implement and no test to write — the verification is re-reading the section against the tree.

### Check the whole section, not just the two named problems

The entry names one wrong path and one duplicated bullet. A list of paths that has already drifted once has probably
drifted elsewhere, so the correction re-reads the section against `git diff --name-only` rather than fixing only what
was reported. Anything found that is genuinely correct stays as the author wrote it.

## Proposed changes

### The pull request description only

- Change the `shared/context-menu` bullet to name `web/src/context-menu/default-menu-target.ts` and
  `web/src/context-menu/useDefaultContextMenu.ts`.
- Merge the two `web/src/overlay-plugins/chords.ts` bullets into one carrying both the chord ids and the reason
  `eventChordId` exists.
- Re-read the rest of the section's paths against the tree as it stands, which by now includes
  `web/src/shared/app-chords.ts` and the changes the fix commits made to `web/src/useOverlayPlugins.ts`.

Every other character of the body stays exactly as written. The title is not touched.

## Tests

None. No source file changes, so no suite covers this and none should be asked to.

## Out of scope

- Any inaccuracy in the description that is not a file path or a duplicated bullet. If one is found while re-reading,
  it is recorded rather than fixed here.
- The **How to verify** section, which the testing task owns.

## Verification

- `gh pr view 1499 --json body` after the edit, compared against `git diff origin/master...HEAD --name-only`.
