# Name the target branch in the editor's commit-to-origin tooltip

Issue: the commit to origin buttons tooltip in the editor should also mention the target branch the
same way that the commit to master button in the file navigator does.

Complexity rating: 4/10

## Goal

The file navigator's header commit button already names the branch a commit will push to
(`Commit changes to origin (branch main)`, per `product/specs/file-navigator-tab.md`). The editor
tab's metadata-row "Commit to origin" icon (`web/src/editor/EditorCommitButton.tsx`) never does —
its tooltip is always the bare `Commit to origin` (plus a state suffix). Give the editor's button
the same branch-naming tooltip, sourced from the git branch of the directory the file being edited
lives in.

## Approach

`EditorView` (`src/tab/types.ts`) has no branch field today. `FileNavigatorView.branch` is resolved
asynchronously and refreshed on demand because a tree stays open and its branch can change under it;
an editor tab's file, by contrast, already resolves its git root once at open time the same way its
`size` does (`src/openers/editor.ts`), so the simplest correct fix computes the branch synchronously
at open time with a new `currentBranchSync` companion to `src/git/status.ts`'s existing async
`currentBranch`, mirroring the sync `execFileSync` pattern already used in `src/git/identity.ts`.

The tooltip-suffix logic (`` (branch ${branch})``) already exists once, in
`FileNavigatorCommitButton.tsx`. Extract it into a shared helper so the editor's button reuses it
rather than duplicating the string-building logic.

## Implementation steps

1. In `src/git/status.ts`, add `currentBranchSync(root: string): string | undefined`, mirroring
   `currentBranch`'s doc comment and behavior (never throws; `HEAD` for detached; `undefined` off a
   git repo or on any git failure) but using `execFileSync` instead of the promisified `execFile`.
2. In `src/tab/types.ts`, add `branch?: string;` to `EditorView`, documented like
   `FileNavigatorView.branch` — the git branch of the directory containing the edited file, resolved
   once at open time, `undefined` outside a git repository or when it can't be determined.
3. In `src/openers/editor.ts`'s `openInEditor`, compute
   `const branch = currentBranchSync(path.dirname(file));` and add `branch` to the object passed to
   `context.openEditorTab`.
4. In `src/open/file-manager.ts`'s `finishOpenSynced`, after the shared sync workspace settles,
   compute the same way (`currentBranchSync(path.dirname(target))`) and include `branch` in the
   `tab.editor = { ...tab.editor, size, sync: 'synced', branch }` patch, so a GitHub-synced tab's
   commit button also names its branch.
5. Add `web/src/shared/commit-branch-tooltip.ts` exporting
   `commitBranchTooltipSuffix(branch?: string): string`, holding the logic currently inlined as
   `tooltipSuffix` in `FileNavigatorCommitButton.tsx`. Update `FileNavigatorCommitButton.tsx` to
   import and use it instead of its own local copy.
6. In `web/src/editor/EditorCommitButton.tsx`, add a `branch?: string` property, build the title as
   `` `Commit to origin${commitBranchTooltipSuffix(branch)}${commit ? `: ${STATE_NOTES[commit]}` : ''}` ``,
   and use the same string for both `title` and `aria-label`.
7. In `web/src/editor/EditorMetaRow.tsx`, pass `branch={editor.branch}` to `EditorCommitButton`.
8. Run `./scripts/run.mjs check-diff` after each step.

## Tests

- `src/git/status.test.ts`: add a `currentBranchSync` describe block mirroring the existing
  `currentBranch` tests — named branch, detached `HEAD`, non-git directory, and a failing
  invocation — using the same `initRepo`/`commitAll` helpers.
- `src/openers/editor.test.ts`: extend `fakeContext`'s temp-file setup with a variant that
  initializes a git repo (mirroring `git/status.test.ts`'s `initRepo`), and add a test that
  `openInEditor` populates `branch` for a file inside a git repo on a named branch, plus a test that
  it stays `undefined` for a file outside any git repository (the existing plain `temporaryFile`
  case already covers this if asserted explicitly).
- `web/src/shared/commit-branch-tooltip.test.ts`: new — empty string for `undefined`, and
  `` (branch <name>)`` for a given branch name.
- `web/src/editor/EditorCommitButton.test.tsx`: add two cases mirroring
  `FileNavigatorCommitButton.test.tsx`'s branch tests — the branch named in the resting tooltip, and
  the branch named alongside a status suffix.
- `web/src/file-navigator/FileNavigatorCommitButton.test.tsx`: unchanged in behavior; its existing
  branch tests must keep passing after the refactor to the shared helper.

## Out of scope

- Refreshing an editor tab's branch after it opens (e.g. if the user switches branches in a
  terminal while the tab is open) — the file navigator's branch already only refreshes with the
  tree, and an editor tab has no equivalent refresh trigger; this mirrors the navigator's own
  once-per-open-of-what-governs-it behavior closely enough not to need one.
- Disabling or hiding the editor's commit button when no branch can be determined — unlike the file
  navigator's header button, the editor's button is never conditionally absent (see
  `product/specs/editor-tab.md`), so it simply omits the tooltip's branch clause the same way the
  navigator's tooltip omits it when `branch` is `undefined`.

## Specs and docs

- `product/specs/editor-tab.md`: the "Committing to origin" section gets a sentence noting the
  icon's tooltip names the branch the push will go to, matching the wording
  `product/specs/file-navigator-tab.md` already uses for its own commit button.
- `help.md`: checked; it does not document editor tooltip wording, so no update expected.
