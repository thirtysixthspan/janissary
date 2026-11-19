# Handle filesystem read failures in the local list executor

**Complexity: 3/10** — 1 production file, ~16 added lines in one small helper plus a catch, 6 requirements and 10 pinning scenarios with 1 new function (p=4.76)

## Goal

`src/file-list/tab-list.ts` currently answers every failure of the `lstatSync` existence/type check with `missing`, because the bare `catch` calls `fileFailureLine('File not found', ...)`, and lets a rejection from `port.readDirectory` escape `listFilesInTab` as a rejected promise. The executor should classify the OS error: absence (`ENOENT`/`ENOTDIR`) stays `missing`, while access and loop failures (`EACCES`, `EPERM`, `ELOOP`, and any other code) answer `forbidden`, the one-word refusal token. A rejected directory read must resolve to `forbidden` rather than propagate. `listFilesInTab` always resolves to a one-word string. No command, flag, key binding, or user-visible syntax changes.

## Approach

Mirror the error-code classification already used by the reader's `loadBytes` in `src/file-read/read.ts:21-27`: extract a string `code` from the thrown value (`typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'`), treat `ENOENT` and `ENOTDIR` as absence, and treat everything else as a refusal. Put that classification in one small pure helper that returns the one-word token, so the `lstatSync` catch has a single line. `ENOENT` and `ENOTDIR` preserve today's `missing` answer for a path that simply does not name a directory.

Wrap the `port.readDirectory` call in its own `try`/`catch` so a synchronous throw or an async rejection both resolve to `forbidden`. Declare the entries variable before the `try` (typed as `FileNavigatorEntry` from `../file-navigator/index.js`, with the `.js` extension NodeNext requires) and assign it inside, so the filter/stat/render body below is unchanged. The `fileFailureLine` import stays: the lexical policy refusal at line 22 still uses it for the out-of-workspace and secret-path cases.

## Implementation steps

1. In `src/file-list/tab-list.ts`, add a `filesystemFailure(error: unknown): string` helper that extracts the string `code` and returns `missing` for `ENOENT`/`ENOTDIR` and `forbidden` otherwise. Add the `type FileNavigatorEntry` import from `../file-navigator/index.js`. Run `$janissary/scripts/run.mjs check-diff`.
2. Replace the bare `catch` on the `lstatSync` check with `catch (error) { return filesystemFailure(error); }`, keeping the `notdir` branch and the rest of the function body byte-for-byte. Run `$janissary/scripts/run.mjs check-diff`.
3. Replace `const entries = await port.readDirectory(root, relPath);` with a `let entries: FileNavigatorEntry[];` plus a `try`/`catch` that assigns from the port and returns `forbidden` on throw. Leave the filter, stat, and row-rendering lines below unchanged. Run `$janissary/scripts/run.mjs check-diff`.
4. Confirm `src/file-list/tab-list.ts` is well under the 200-line `max-lines` limit, so no extraction is needed. Run the full `$janissary/scripts/run.mjs check-diff` once more with all changes in place.

## Tests

- In `src/file-list/tab-list.test.ts`, add one executor test that passes a port whose `readDirectory` throws, calls `listFilesInTab(..., 'file list .', fakePort)`, and asserts the resolved value is the one-word string `forbidden`. The real temp `root` passes the `lstatSync` check, so the throw comes from the port.
- Keep the existing executor cases green unchanged: `notdir` for a file target, `missing` for an absent path, `(empty directory)`, `forbidden` for out-of-workspace and secret paths, mixed rows, subdir stats, secret filtering, vanished-entry zero stat, malformed usage, and workspace-vs-launch-dir root choice.
- No new test file.

## Out of scope

- Changing `FileSystemPort`, `LocalFileSystemPort`, or `fileFailureLine`; the port's raw-data rejection contract and the failure-line helper stay as they are.
- Changing the one-word vocabulary, row format, secret policy, containment check, or root resolution.
- Dispatcher wiring and the `file list` command entry (subplan 7 of the parent feature), specs and user documentation (subplan 9), and any help or docs edits; this fix has no user-visible syntax change and is verified through the colocated executor test only.
