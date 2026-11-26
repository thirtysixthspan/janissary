# Write exports through dangling ssh config symlinks

**Complexity: 4/10** — ~9 added lines, 1 edited file, 9 requirements and 6 test scenarios (p=4.71)

## Goal

An export aimed at an ssh config path that is a symlink whose target does not exist yet must keep the symlink and create the file it names. Today `writeSshConfigFile` resolves a live link but, when `realpathSync` throws because the pointed-to file is missing, falls through and overwrites the link itself with a regular file. The user loses the link and the intended target stays absent, so later ssh reads a different file. After this change the export writes through the dangling link to its resolved target.

## Requirements

1. "Exporting to a symlink whose target does not exist yet replaces the link with a regular file instead of writing through to the file it points at." When `lstatSync` identifies a link and `realpathSync` fails with `ENOENT`, the write lands on the file the link names.
2. "resolve the link target with `readlinkSync` relative to the link's directory" — the link text is read and resolved against the directory holding the link, so a relative link target is written at its resolved path and an absolute one is unchanged.
3. "create that target's parent directories with the same recursive 0700 mkdir" — missing parents of the resolved target are created recursively with mode `0700`.
4. "the new file mode is 0600" — the resolved target is passed to `replaceFileAtomically` with create mode `0600`, so a newly created target file has mode `0600`.
5. "so the symlink survives" — after the export the link is still a symlink pointing at the same text it held before.
6. "Keep the current behavior for a live symlink" — a link whose target exists is still resolved to that target and written through, with the link left in place.
7. "a missing non-symlink file" — a missing regular file is still created at the requested path with mode `0600`.
8. "an existing file's mode" — a target file that already exists keeps its own mode and is not chmodded to the create mode.
9. "all mapped problem words" — a write failure still reports `no such file`, `is a directory`, `permission denied`, or `could not be read` as before and leaves the original bytes in place.

## Design decisions

- Resolve the dangling link by reading its text and writing the file it names, rather than replacing the link, because the link is user-owned state and the export must not destroy it (Requirement 5; Proposal "so the symlink survives").
- Resolve a relative link text against the directory that holds the link with `path.resolve(path.dirname(target), readlinkSync(target))`, which also leaves an absolute link text unchanged (Requirement 2; Assumption 4).
- Trigger the fallback only on `ENOENT`, the error a missing pointed-to file produces. Other `realpathSync` failures keep the earlier behavior of writing at the requested path, so problem-word mapping is unchanged (Requirements 9, Assumptions 5).
- Reuse the existing `PARENT_MODE` recursive `mkdirSync` and the existing `replaceFileAtomically` create-mode argument instead of introducing another write path, so create modes cannot drift (Requirements 3, 4; Assumptions 1 to 3).
- Keep the whole change inside `writeSshConfigFile`. The file is 43 lines, far under the 200-line `max-lines` limit, so no module extraction is needed (Assumption 6).

## Preserved behavior

1. A live symlink is written through to the file it points at and stays a symlink. It must not be replaced by a regular file, and the bytes must not appear at the link path while the target stays stale. Pinned by `src/plugins/hosts/ssh-config-file.test.ts` › `writes through an existing symlink and leaves the link pointing at the same target`.
2. A missing non-symlink file is created at the requested path with mode `0600`. It must not be redirected to another path or given the parent directory's mode. Pinned by `src/plugins/hosts/ssh-config-file.test.ts` › `creates a missing file with mode 0600`.
3. A missing parent directory is created recursively with mode `0700`. It must not be left missing or created with another mode. Pinned by `src/plugins/hosts/ssh-config-file.test.ts` › `creates a missing parent directory with mode 0700`.
4. An existing file keeps its own mode across a write. The create mode must not be applied to a file that is already there. Pinned by `src/atomic-write.test.ts` › `preserves an existing file mode`.
5. A failed write reports its mapped problem word and leaves the original bytes intact. It must not return a different word or truncate the target. Pinned by `src/plugins/hosts/ssh-config-file.test.ts` › `reports the mapped problem word and leaves the original bytes in place on a write error`.

## Assumptions

1. `src/plugins/hosts/ssh-config-file.ts:38` `replaceFileAtomically(target, Buffer.from(content, 'utf8'), TARGET_MODE);` supplies the create mode at the write site.
2. `src/atomic-write.ts:13` `const mode = existingMode(file) ?? createMode;` applies that mode only when the target does not exist.
3. `src/plugins/files.ts:93` `export function replaceFileAtomically(` forwards an optional create mode to the atomic writer.
4. `src/plugins/hosts/ssh-config-file.ts:36` `if (lstatSync(target).isSymbolicLink()) target = realpathSync(target);` is the existing symlink-resolution branch to extend.
5. `src/plugins/hosts/ssh-config-file.ts:37` `/* a missing destination is written at its requested path */` records that a missing destination is not an error and is written where requested.
6. `src/plugins/hosts/ssh-config-file.ts` is 43 lines, so the added branch stays well inside `max-lines: 200` from `eslint.config.mjs:62`.

## Existing functionality

1. `src/plugins/hosts/ssh-config-file.ts:30` `export function writeSshConfigFile(` is the write entry point that already creates parent directories, resolves live links and writes atomically.
2. `src/plugins/hosts/ssh-config-file.ts:7` `const PARENT_MODE = 0o700;` is the mode to reuse for the resolved target's new parents.
3. `src/plugins/hosts/ssh-config-file.ts:6` `const TARGET_MODE = 0o600;` is the create mode to pass for the resolved target.
4. `src/plugins/files.ts:93` `export function replaceFileAtomically(` is the atomic replace primitive used for the write.
5. `src/plugins/hosts/ssh-config-file.test.ts:103` `writes through an existing symlink and leaves the link pointing at the same target` is the fixture and assertion pattern to mirror for the dangling case.
6. `src/plugins/hosts/ssh-config/section.test.ts` holds the managed-section tests that exercise exports and must keep passing unchanged.

## Implementation steps

1. In `src/plugins/hosts/ssh-config-file.ts`, add `readlinkSync` to the `node:fs` import. Inside the existing `lstatSync(...).isSymbolicLink()` branch, give `realpathSync(target)` its own `catch`: when the error carries `code === 'ENOENT'`, read the link text with `readlinkSync(target)`, resolve it against `path.dirname(target)` with `path.resolve`, create the resolved target's parent with the same `mkdirSync(..., { recursive: true, mode: PARENT_MODE })`, and assign the resolved path to `target` before the existing `replaceFileAtomically` call. Leave the live-link branch, the missing-non-symlink path, `problemFor` and the outer error mapping untouched. Build and check with `$janissary/scripts/run.mjs check-diff`.

## UI design

1. None. The change alters which file an export writes through; it adds no control, layout, state, key binding or notification, and the Hosts tab's Import and Export buttons behave exactly as before.

## Tests

- `src/plugins/hosts/ssh-config-file.test.ts`: add one case that creates a symlink pointing at a path inside a not-yet-existing parent directory, exports through the link, and asserts the link is still a symlink, its text is unchanged, the bytes are at the resolved target, the resolved target's new parent exists, and the new file's mode is `0600` (Requirements 1 to 5). Mirror the scratch-directory fixture and `lstatSync`/`readlinkSync` assertions of the existing symlink case (Existing functionality 5).
- The existing create-mode, parent-mode, live-symlink and write-failure cases stay untouched and keep passing (Preserved behavior 1 to 5).
- `src/plugins/hosts/ssh-config/section.test.ts` stays untouched and keeps passing (Existing functionality 6).

## Out of scope

- Changing the symlink itself, converting a dangling link into a regular file, or repairing a link that points at a directory.
- Changing `readSshConfigFile`, `problemFor`, or any problem-word wording.
- Changing `src/atomic-write.ts` or `src/plugins/files.ts`.
- Changing import, managed-section splicing, command parsing, or the catalog-path guard.
- Editing user or developer documentation; that is owned by `update-documentation.md`.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then check against the running app:

1. In a scratch directory, create a dangling link with `ln -s nested/target/config link` and seed a saved host, then run `hosts export <scratch>/link` from the app.
2. `ls -l <scratch>/link` must still show `link -> nested/target/config`, and `cat <scratch>/nested/target/config` must show the managed section with the saved host. `stat -f '%Lp' <scratch>/nested/target/config` must print `600`, and the new `nested/target` parent must exist.
3. Failure looks like `link` becoming a regular file, the target missing, or a mode other than `600`.
4. Repeat with a live symlink and confirm the link still points at the same target and the bytes are written there.
