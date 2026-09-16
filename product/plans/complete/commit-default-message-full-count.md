# Base the header commit's default message on every change under the tree root

**Complexity: 3/10** — one new field threaded through an existing payload write the same way `pull`/
`commit` already are, one new pure helper beside an existing one, and one call-site swap. The only real
design decision is how the whole-tree call site supplies its message without forcing
`useFileNavigatorCommit.request`'s existing path-based API to accept a bare count.

The header's **Commit changes to origin** button pre-fills its message from `changedFilePaths` in
`web/src/file-navigator/file-navigator-commit-message.ts`, which counts only the non-directory rows
the current payload is rendering. The header button itself commits everything under the tree's root,
not merely what is visible — and `markGitStatus` deliberately rolls a collapsed directory's changed
files up onto the directory row, which `changedFilePaths`'s `!row.dir` filter then drops. A tree whose
changes sit inside a collapsed directory opens the field pre-filled with `commit: 0 files` even though
there is something real to commit, and a tree with one visible changed file names that file outright
while the commit may carry several more that are simply out of view.

## Approach

**The server already has the true count.** `FilesTabState.gitStatuses` (`src/file-navigator/state.ts`)
is the full root-relative changed-path map for the tree, populated by `changedPaths`
(`src/git/status.ts`) from `git status --porcelain=v1 -- .` at the tree root — every changed *file*
under the root, regardless of what is expanded or collapsed, and never a directory entry (porcelain
output never reports one). `gitStatuses.size` is exactly the count the default message needs, with no
filtering required.

**Carry it exactly like `pull`/`commit` already are.** `FileNavigatorView` gains an optional
`changedCount?: number` beside `commit`; `writeRebuiltPayload` in `manager-payload.ts` writes it from
`state.gitStatuses?.size ?? 0` next to `commit: state.commit`. `writeCreatedPayload` stays untouched —
it runs before git metadata exists at all, the same reason `pull`/`commit` are absent there too.
`src/protocol.ts` re-exports `FileNavigatorView` wholesale, so the new field crosses through with no
further plumbing.

**The whole-tree default stops naming a file, even for a count of one.** A count has no filename to
name, so the new helper's singular case reads `commit: 1 file` rather than naming the file the way the
existing path-based `defaultCommitMessage` does for a single selection. This is a real, visible change
from today's single-visible-file behavior, and it is the correct trade: a message that names a file
because that file happens to be the only *visible* one, while the actual commit may carry several more
outside the current view, is exactly the misdescription this fix removes.

**`useFileNavigatorCommit.request` keeps its existing shape for the row menu.** Rather than teaching
`request`'s `namedFor: string[]` parameter to also accept a bare count (which would force an awkward
synthetic array just to reach `defaultCommitMessage`'s branch), `request` gains a second parameter that
is the *already-built* default message, defaulting to `defaultCommitMessage(paths)` when omitted:

```ts
const request = (paths: string[], defaultMessage: string = defaultCommitMessage(paths)) => {
  setPendingCommit({ paths, defaultMessage });
};
```

Every existing call site — the row menu's `commit.request(selectionOrRow(row))` — is unaffected, since
omitting the second argument reproduces today's path-based default exactly. `commitEverything` in
`FileNavigatorTab.tsx` becomes the one caller that supplies a pre-built message:
`commit.request([], defaultCommitMessageForCount(files.changedCount ?? 0))`. `changedFilePaths` then
has no remaining caller and is deleted along with its `import` in `FileNavigatorTab.tsx`.

**Test location.** `changedFilePaths`'s own tests live inside
`web/src/file-navigator/FileNavigatorCommitPopup.test.tsx` (a `describe('changedFilePaths', ...)`
block, not a standalone file) alongside `defaultCommitMessage`'s — the new helper's tests join them in
the same file, and the `changedFilePaths` block is deleted rather than left orphaned.

## Implementation steps

1. `src/tab/types.ts` — add `changedCount?: number` to `FileNavigatorView` beside `commit`, with a
   comment naming it as every change under the tree root, not only the rows currently rendered.
2. `src/file-navigator/manager-payload.ts` — `writeRebuiltPayload` writes
   `changedCount: state.gitStatuses?.size ?? 0` next to `commit: state.commit`.
3. `web/src/file-navigator/file-navigator-commit-message.ts` — add
   `defaultCommitMessageForCount(count: number): string` (`commit: 1 file` / `commit: <n> files`,
   including `commit: 0 files`); delete `changedFilePaths`.
4. `web/src/file-navigator/useFileNavigatorCommit.ts` — `request` gains the `defaultMessage` parameter
   described above, defaulting to `defaultCommitMessage(paths)`.
5. `web/src/file-navigator/FileNavigatorTab.tsx` — drop the `changedFilePaths` import; `commitEverything`
   becomes `commit.request([], defaultCommitMessageForCount(files.changedCount ?? 0))`.

## Tests

- `web/src/file-navigator/FileNavigatorCommitPopup.test.tsx`: delete the `changedFilePaths` describe
  block and its import; add a `defaultCommitMessageForCount` describe block with cases for `0`, `1`,
  and several.
- `web/src/file-navigator/FileNavigatorTab.test.tsx`: the `'opens the commit-message field rather than
  sending anything...'` case keeps its `commit: 0 files` expectation (an absent `changedCount` defaults
  to `0`, unchanged text, different derivation) — no edit needed there beyond confirming it still
  passes. The `'sends the commit the message field produced, naming no paths for the whole
  tree'` case changes: it must now set `changedCount: 1` on its `makeFiles` override, and its two
  `commit: README.md` expectations (the field's value and the sent message) become `commit: 1 file`,
  since the whole-tree default no longer names a file. Add a new case with `changedCount` set higher
  than the visible row count (e.g. `changedCount: 3` with only one visible changed row) asserting the
  field opens with `commit: 3 files` — the case that fails today.
- `src/file-navigator/manager.test.ts`: a case that the rebuilt payload's `changedCount` reflects a
  change inside a collapsed directory (i.e. equals `gitStatuses.size` even though the collapsed
  directory's own row is the only one carrying `gitStatus`) — the server-side half of the case that
  fails today.

## Out of scope

- **`defaultCommitMessage`'s own single-file-naming behavior for the row menu.** Selecting one file or
  directory and choosing `Commit to origin` keeps naming it outright; only the whole-tree header
  button's default changes, since only it currently derives its message from what happens to be
  visible rather than from what it actually commits.
- **Any change to what the commit itself sends.** `commitEverything` already sends `paths: []` for the
  whole-tree form; this fix only changes what text the field opens pre-filled with.

## Verification

Automated: `./scripts/run.mjs check-diff` after each step.

Manual: not performed — this is a payload-field and pure-helper change exercised through the existing
component and manager test harnesses, which is the verification available here.
