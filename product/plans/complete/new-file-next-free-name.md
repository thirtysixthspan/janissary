# Open the next free postfixed name when the New file target already exists

**Complexity: 3/10** — one new server command plus one method on the existing `OpenFileManager`, reusing the already-existing `nextFreeName` helper. No new data model, no protocol change, no component logic changes beyond the one command string the New file button sends.

## Goal

The file navigator's "New file" button and Cmd+N (`web/src/file-tree-new-file.ts`) always send `edit <dir>/untitled.md`. If `untitled.md` already exists in that directory, the generic `edit` command opens the existing file for editing (correct behavior for a literal `edit` invocation) instead of creating a new blank file — the user loses the "new file" affordance the moment the default name collides. Per the backlog request, the New file flow should instead open `untitled-2.md` (or the next free `untitled-N.md`) when `untitled.md` is already taken, matching the naming scheme `src/editor/next-free-name.ts` already uses for the analogous first-save collision case.

## Approach

Reusing the generic `edit` command for this would conflate two different intents: a user literally typing `edit untitled.md` wants that exact file, existing or not, while the New file button always wants a *fresh* file and should never land on an existing one. So the New file button gets its own server command, `newfile <path>`, distinct from `edit`. It resolves the target the same way `OpenFileManager.edit()` does (cwd + `expandUserPath`), then applies the existing `nextFreeName(dir, name)` helper (`src/editor/next-free-name.ts`) to the resolved directory/basename before handing off to the same `openInEditor` used by `edit`. The client-side change is a one-line swap: `newFileCommand` builds `newfile ...` instead of `edit ...`.

## Implementation steps

1. Add a `newFile(command, target, label)` method to `OpenFileManager` (`src/open-file-manager.ts`), modeled on the existing `edit()` method: resolve `cwd`/`expandUserPath`/`path.resolve` the same way, then compute `path.join(dir, nextFreeName(dir, path.basename(file)))` and call `openInEditor` with the resolved path. Import `nextFreeName` from `./editor/next-free-name.js`.
2. Add `src/commands/new-file.ts` exporting a `Command` named `newfile`, modeled on `src/commands/edit.ts`: match `/^newfile\b/i`, parse the target (no line-number suffix support needed — new files never have one), show `Usage: newfile <file>` when no target is given, append the command to the transcript, then call `managers.openFile.newFile(command, target, tab.label)`.
3. Register the new command in `src/commands/index.ts` (import and add to the `commands` array, alongside `edit`).
4. In `web/src/file-tree-new-file.ts`, change `newFileCommand` to build `newfile ...` instead of `edit ...`.

## Tests

- `src/commands/new-file.test.ts` (new, mirroring `src/commands/edit.test.ts`): name is `newfile`; matches `newfile foo.txt` / `NEWFILE bar.md` case-insensitively; does not match `newfiled` or `edit foo.txt`; appends to transcript before calling `openFile.newFile`; usage message and no call when target is missing.
- `src/open-file-manager.test.ts` (extend if it exists, else add case to nearest existing coverage): `newFile()` opens the literal target when it doesn't exist yet; opens `untitled-2.md` when `untitled.md` already exists in the target directory; opens `untitled-3.md` when both `untitled.md` and `untitled-2.md` exist.
- `web/src/file-tree-new-file.test.ts`: update the two `newFileCommand` assertions to expect `newfile untitled.md` / `newfile src/untitled.md`.
- `web/src/FileTreeTab.test.tsx`: update the New file button / Cmd+N assertions (currently expecting `{method:'command', params:{text:'edit ...'}}`) to expect `newfile ...` instead.

Run `./scripts/run.mjs check-diff` after each step.

## Spec updates

- `product/specs/file-tree-tab.md` — add a sentence noting that if the default name already exists in the target directory, the next available `untitled-N.md` name is opened instead.

## Docs

- Check `help.md` and `documentation/user-documentation/` for any description of the New file button's naming behavior; update only if an existing description would now be wrong. No new documentation for previously-undocumented behavior.

## Out of scope

- Changing `edit`'s own collision behavior — a literal `edit <file>` command still opens exactly that file.
- The save-time collision handling in `src/editor/save.ts` — unaffected, still applies to the (now rarer) case of two new-file tabs racing to save the same name.
- Any change to how the target directory is chosen (`newFileTargetDir`) — only the resulting filename changes.
