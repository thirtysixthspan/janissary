# Refuse a swapped or grown target at edit read time

**Complexity: 1/10** — ~3 added lines in 1 file, 2 requirements, 2 scenarios (p=3.36)

Source: PR #1996 backlog entry "Harden the edit helper's read so a target swapped for a named pipe or grown past the size limit after classification is refused rather than opened or read whole."

## Goal

The edit helper's private reader must never open a non-regular file and must never edit a file larger than 5 MiB, even when the target changes after the target resolver classified it.

## Approach

In `readEditableFile`, keep the `statSync(realPath)` result and refuse `Not a text file` when it is not a regular file, before any open. Keep the size refusal, and after `readFileSync` refuse `File too large (>5 MB)` when the bytes read exceed `FILE_POLICY_MAX_BYTES`. Check order stays size before decode.

## Implementation steps

1. In `src/file-write/edit.ts`, store the stat result, add the `isFile` refusal, and add the post-read byte-length refusal.

## Tests

- New `src/file-write/edit-read-race.test.ts`, mocking `node:fs` so `statSync` reports a non-regular file for a seeded regular file: the edit is refused with `Not a text file` and `readFileSync` is never called.
- Same file, mocking `statSync` to report a small size for a file over 5 MiB: the edit is refused with `File too large (>5 MB)` and the file is unchanged.
- Existing `refuses a named pipe without opening it`, `refuses an existing file over 5 MiB`, and replacement tests in `src/file-write/edit.test.ts` keep passing unchanged.

## Out of scope

- Closing the residual window between the in-read stat and the open, and exporting the reader for tests.
- The target resolver and any spec change: the helper is not yet wired to a user-visible tool.
