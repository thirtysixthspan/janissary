# Auto-focus and start renaming a newly created directory in the file navigator

**Complexity: 3/10** — client-only: one guessed-path watcher plus reuse of the rename hook added by
`product/plans/complete/file-navigator-rename-editor-sync.md`. No protocol or server change.

## Goal

Clicking the file tree's **New directory** button creates a directory named `untitled` (or the
next free name on collision) but leaves the user to find the new row and manually trigger a rename
(Cmd+R/Ctrl+R, added by the rename feature above) to give it a real name. The backlog asks that the
new directory be selected and its rename field opened immediately, the same as a conventional
editor's "New Folder" affordance.

## Approach

`createNewDirectory` (`web/src/FileTreeTab.tsx`) sends a fire-and-forget `newdir <target>` command
(`src/commands/new-directory.ts` → `OpenFileManager.newDirectory`, `src/open-file-manager.ts:45-52`)
with no reply — the tree only learns the directory exists once the OS-level directory watcher
notices it and rebuilds `files.rows` (the same mechanism the "New file" button's target directory
already relies on becoming visible in the tree). There is no RPC round trip to hook a callback into,
so this has to be watched for client-side: record the *guessed* tree-relative path the new
directory should land at (`newDirectoryTargetPath`, added to `web/src/file-tree-new-file.ts`) when
the button is clicked, then watch `files.rows` (the tree already has exactly this kind of
prop-driven watcher — see the existing selection-clamp `useEffect`,
`web/src/FileTreeTab.tsx:60-66`) for a directory row at that path to appear; when it does, select it
and start its rename field via the same `useFileTreeRename` hook the Cmd+R chord already uses.

**Accepted limitation:** the guessed path assumes no name collision. If the target directory
already contains an `untitled` entry, the server silently picks `untitled-2` (`nextFreeName`,
`src/editor/next-free-name.ts`, already shared with the "New file" flow) and the guess never
matches, so auto-select/rename silently does not fire for that one creation — the directory is
still created correctly, just without the auto-rename convenience. Giving the client the real
resolved name would require turning `newdir`'s fire-and-forget command into an RPC with a reply,
which is a materially bigger change than this backlog item calls for; documented as out of scope.

## Implementation steps

1. **`web/src/file-tree-new-file.ts`** — add `newDirectoryTargetPath(targetDir: string | null): string`
   (the guessed tree-relative path, `'untitled'` or `'<targetDir>/untitled'`), and refactor
   `newDirectoryCommand` to build its command string from it instead of duplicating the concatenation.
2. **`web/src/FileTreeTab.tsx`** — `createNewDirectory` additionally records the guessed path (a new
   `pendingNewDir` state, `string | null`) before sending the command. A new `useEffect` watching
   `files.rows` (alongside the existing selection-clamp effect) checks for a directory row whose
   `path` matches `pendingNewDir`; when found, calls `setSelected(row.path)` and
   `rename.begin(row.path, row.name)` (the same hook the Cmd+R chord already drives), then clears
   `pendingNewDir` so the watch stops. If `files.rows` changes for an unrelated reason and no match
   is found, nothing happens — cheap enough to just keep checking on every rows update.

## Tests

- `web/src/file-tree-new-file.test.ts` (extend): `newDirectoryTargetPath(null)` → `'untitled'`;
  `newDirectoryTargetPath('src')` → `'src/untitled'`; `newDirectoryCommand` still returns the same
  strings as before the refactor (regression coverage for the extraction).
- `web/src/FileTreeTab.test.tsx` (extend, new `describe('new directory auto-rename')` block):
  clicking **New directory** (or the equivalent `createNewDirectory` trigger) then a `files` prop
  update that adds a matching `untitled` directory row results in that row being selected and its
  rename field open (`screen.getByRole('textbox')` pre-filled with `untitled`); a `files` update
  that adds an unrelated row does not open any rename field; a `files` update where the actual
  created name differs (e.g. `untitled-2`, simulating a collision) does not open a rename field
  either (the accepted limitation, asserted explicitly so a future change can see the boundary).

Run `./scripts/run.mjs check-diff` after each step; all tests must pass.

## Spec updates

- `product/specs/file-tree-tab.md`, "Creating a new file" section (currently only covers files —
  add a short "Creating a new directory" note, or extend the existing new-file coverage) — the New
  directory button already exists per that section's precedent (`New directory creates a folder...`
  at the current header-buttons paragraph); add that the newly created directory is selected and its
  rename field opens immediately, pre-filled with its name, so it can be typed over right away.

## Docs

- `documentation/user-documentation/tab-types/file-navigator.md`, "Creating files and directories"
  section — add a sentence noting the new directory is selected with its name ready to edit,
  matching the spec update above.
- Checked `help.md` — no file-navigator button behavior documented there. No update needed.

## Out of scope

- Giving the client the server-resolved actual directory name (would require converting `newdir`
  from a fire-and-forget command to an RPC with a reply) — see Accepted limitation above.
- Any change to the New file button's behavior (it already opens a real, identifiable editor tab
  and needs no equivalent watcher).
- A keyboard shortcut for New directory (still header-button only, per the existing spec).
