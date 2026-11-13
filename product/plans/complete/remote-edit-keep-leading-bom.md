# Keep a leading BOM in remote edit-file strings
**Complexity: 1/10** — ~1 added line, 1 file, 1 requirement, 2 scenarios (p=2.92)

## Goal

A remote `file edit` must match and insert the same text a local edit does. Today the far side decodes the base64 `oldString` and `newString` with a BOM-stripping decoder, so a string that begins with U+FEFF loses it on a remote tab while the local edit and the far side's file decode keep it.

## Approach

In `src/remote/filesystem/edit-file-operation.ts`, decode the base64 edit strings with `new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })`, matching `decodeEditableText` in `src/file-write/edit-text.ts` and `decodeToolText` in `src/file-write/port-adapter.ts`. Strict base64 and invalid-UTF-8 refusals are unchanged.

## Implementation steps

1. Add `ignoreBOM: true` to the decoder in `decodeBase64Text`.

## Tests

- `src/remote/filesystem/operations.test.ts`: edit-file decodes a base64 `oldString` and `newString` that start with U+FEFF to strings that still start with it.
- `src/remote/serve-file-navigator.test.ts`: a far-side edit with `oldString` U+FEFF + "hello" and `newString` "hello" on a file holding U+FEFF + "hello\n" leaves "hello\n" on disk.
- BOM characters are built at runtime with `String.fromCodePoint(0xfeff)`.
- Existing edit-file argument tests (strict base64, invalid UTF-8) keep passing unchanged.

## Spec

- `product/specs/acp.md`: state that edit strings keep a leading byte order mark on local and remote tabs alike.

## Out of scope

- Other decoders on the remote path; write-file content travels as bytes and is unaffected.
