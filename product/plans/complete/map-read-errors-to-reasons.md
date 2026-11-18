# Map filesystem failures in file read to their real reasons

**Complexity: 3/10** — ~6 added production lines in 1 file, 6 behavioral requirements and 7 test scenarios, no new units (p=4.44); a localized catch-block change that reuses the navigator's existing reason mapper.

## Goal

`file read` reports every filesystem failure thrown inside `loadBytes` as `File not found`, even when the file exists and the failure is a permission error or a symlink loop. The reader should name the real reason using the mapping the file navigator already uses, while keeping the cases where a path simply does not name a readable file as `File not found`. No command, flag, key binding, or user-visible syntax changes.

## Approach

`src/file-navigator/file-operation-result.ts` already exports `fileOperationReason`, which turns a Node error code into one reason line: `EACCES` and `EPERM` become `Permission denied; check file and folder permissions, then try again`, and a code it does not know, such as `ELOOP`, becomes `Filesystem error ELOOP; check the item and destination, then try again`. Import it directly in `src/file-read/read.ts` with the `.js` extension, as NodeNext requires, and use it in the `loadBytes` catch.

Two codes keep their current meaning. `ENOENT` is a missing path or dangling symlink, and `ENOTDIR` is a path whose parent is a regular file. Both have always printed `File not found` and stay that way; they are the only codes the reader treats as not-found. Every other failure gets the mapped reason. The lexical policy check and `checkRealTarget` return `FilePolicyFailure` values from inside the try block before any thrown I/O error can occur, so those refusals are untouched.

## Implementation steps

1. In `src/file-read/read.ts`, import `fileOperationReason` from `../file-navigator/file-operation-result.js` and widen `loadBytes`'s return type from `Buffer | FilePolicyFailure` to `Buffer | string`.
2. Replace the bare `catch` with one that extracts a string `code` from the thrown value, returns `'File not found'` when the code is `ENOENT` or `ENOTDIR`, and returns `fileOperationReason(error)` for everything else. Leave the try body unchanged so `checkLexicalPath`, `checkRealTarget`, `classifyStats`, and the policy refusals behave exactly as today. Run `$janissary/scripts/run.mjs check-diff`.
3. Check the file-size limit. `src/file-read/read.ts` is well under 200 lines, so no extraction is needed.
4. Run the full `$janissary/scripts/run.mjs check-diff` once more with all changes in place.

## Tests

- In `src/file-read/read.test.ts`, update `reports an existing file without read permission as not found` to expect `Permission denied; check file and folder permissions, then try again: locked.txt.` That case is already skipped when running as root, since root can read a mode-000 file.
- In `src/file-read/read.test.ts`, add a symlink-loop case: point a link at itself and assert the read prints `Filesystem error ELOOP; check the item and destination, then try again: <path>.`
- Keep all existing cases green without new assertions: missing file and dangling symlink (`ENOENT`), path under a regular file (`ENOTDIR`), directories, binary and invalid UTF-8 content, the size cap, containment, secrets, and command output.
- No new test file.

## Out of scope

- Changing `fileOperationReason` or the `ERROR_REASONS` table in `src/file-navigator/file-operation-result.ts`; the navigator's own messages stay byte-for-byte.
- Changing the reader's lexical, real-target, directory, size, or secret policy, or the format of its numbered output lines.
- Moving the shared result module into a new `src/file-operations/` namespace.
- New commands, flags, key bindings, or new documentation. The only docs work is correcting the two existing descriptions of the changed read error.
