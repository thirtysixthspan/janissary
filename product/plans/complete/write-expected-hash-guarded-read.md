# Guard the whole-file write's expected-hash read
**Complexity: 2/10** — ~20 added lines, 2 files, 3 requirements (p=4.11)

## Goal

Give the whole-file write's expected-hash read (`readExistingText` in `src/file-write/filesystem.ts`) the same read-time regular-file and post-read size guards the edit helper's `readEditableFile` already applies, so the two helpers cannot drift.

## Approach

Extract one bounded regular-file byte read into `src/file-write/bounded-read.ts` and use it from both helpers. It stats the path, refuses a non-regular file as `Not a text file` before opening, refuses a stat size over 5 MiB, reads the bytes, and refuses a read length over 5 MiB. The write helper decodes the bytes as lossy UTF-8 with one leading BOM stripped, as before; the edit helper keeps its strict decode.

## Implementation steps

1. Add `readBoundedRegularFile(realPath)` in `src/file-write/bounded-read.ts`.
2. Use it from `readEditableFile` in `src/file-write/edit.ts`.
3. Use it from `readExistingText` in `src/file-write/filesystem.ts`.

## Tests

- Add `src/file-write/write-read-race.test.ts`, using the same `node:fs` mock as `edit-read-race.test.ts`: with `expectedHash` set, a target that turns non-regular after classification is refused without being opened, and a target that grew past 5 MiB after the stat is refused and left unchanged.
- `filesystem.test.ts` and `edit-read-race.test.ts` keep passing unchanged.

## Out of scope

- The stat-to-open window itself (a swap between the guarded stat and the open).
