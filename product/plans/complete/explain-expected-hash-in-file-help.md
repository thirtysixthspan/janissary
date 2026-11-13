# Explain expectedHash in the file help page
**Complexity: 1/10** — documentation-only, 0 production files, 2 requirements (p=2.61)

## Goal

Tell users reading `help/file.md` that `expectedHash` is the editor's internal content fingerprint, which `file read` does not print, so they leave it out instead of guessing a value and getting a misleading `This file changed on disk since it was loaded` refusal.

## Approach

Add one sentence after the `expectedHash` sentence in the Writing and editing section of `help/file.md`, and mirror it in the Typed file writes and edits section of `product/specs/acp.md`. Change no code: typed `file write` keeps accepting `expectedHash`, as the source plan decided.

## Implementation steps

1. In `help/file.md`, after the `expectedHash` sentence, state that the value is the editor's internal content fingerprint, that `file read` does not print it, and that a write without it simply creates or overwrites the file, so typed writes normally leave it out.
2. In `product/specs/acp.md`, add the same statement after the write's field list.

## Tests

- No behavior changes, so no new unit tests. The help-page checks run by `check-diff` must keep passing.

## Out of scope

- Removing `expectedHash` from `parseFileMutation` or exposing the fingerprint through any command.
