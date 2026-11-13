# Refuse lone-surrogate write content and edit strings before UTF-8 encoding

**Complexity: 3/10** — ~16 added lines across 2 files, 4 requirements, 8 test scenarios (p=4.61)

The `file write` path encodes its content with `Buffer.from(content, 'utf8')` in `applyMutation` (`src/file-write/tab-write.ts`) before any policy check runs, and `remoteEditFile` (`src/file-navigator/remote/port-reads.ts`) does the same to `oldString` and `newString`. Encoding replaces every lone surrogate with U+FFFD, so the `isWellFormed()` refusals in `encodeToolText`, `checkEditReplacement`, and `replaceExactText` never see the ill-formed text: a write silently stores replacement characters, and a remote edit matches or inserts U+FFFD where the same local edit is refused.

## Goal

A lone surrogate in write content, `oldString`, or `newString` is refused identically on local and remote tabs, before any filesystem effect or remote frame.

## Approach

- In `applyMutation`, before calling the port: a write whose content is not well formed returns `mutationFailureLine('Not a text file', path)`; an edit whose `oldString` is not well formed returns the `No matching text` line; an edit whose `newString` is not well formed returns `Not a text file`. These are the reasons the local helpers already produce.
- In `remoteEditFile`, refuse an ill-formed `oldString` (`No matching text`) or `newString` (`Not a text file`) before encoding, so a direct port caller gets the local port's result and no frame is sent. `remoteWriteFile` receives bytes, not a string, so it has nothing left to check; the tab-level refusal covers writes.

## Implementation steps

1. Add the well-formedness checks to `applyMutation` in `src/file-write/tab-write.ts`, ordered as the local edit checks them (oldString first, then newString).
2. Add the same edit checks to `remoteEditFile` in `src/file-navigator/remote/port-reads.ts`.

## Tests

- `src/file-write/tab-write.test.ts`: on a local tab, a write with lone-surrogate content is refused with `Not a text file` and no file is created; an edit with a lone-surrogate `oldString` is refused with `No matching text` and one with a lone-surrogate `newString` with `Not a text file`, leaving the file unchanged. On a remote tab, the same three commands are refused with the same lines and no frame is sent.
- `src/file-navigator/remote/port.test.ts`: `editFile` with a lone-surrogate `oldString` or `newString` resolves to the local reasons and sends no frame.
- Existing helper tests in `filesystem.test.ts` and `edit.test.ts` keep passing.

## Specs

Update the file write/edit spec to state that text containing an unpaired surrogate is refused before anything is written, on local and remote tabs alike.

## Out of scope

- The BOM-stripping decoder in `edit-file-operation.ts` (separate backlog entry).
- Changing refusal wording.
