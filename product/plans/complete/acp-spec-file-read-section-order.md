# Restore the ACP spec's file-read section order

**Complexity: 1/10** — 0 production lines and 0 production files, 2 documentation requirements (p=2.35)

## Goal

The "Typed file writes and edits" subsection of the ACP spec was inserted inside "File read", so the read primer and the read default-grant paragraph sit under the writes heading, the primer sentence claims the file tool's primer is only the read primer, and the dispatcher paragraph names only reads as workspace commands. Make the spec read correctly against the current code.

## Approach

Documentation-only edit to the ACP spec, describing user-visible behavior without file paths or function names in the touched sentences.

## Implementation steps

1. Move the read primer block and the default-grant paragraph back under "File read", ahead of "Typed file writes and edits".
2. Reword the primer sentence: when a role grants `file read`, the read part of the file tool's primer is exactly the quoted text; the composed primer is described under "File write and edit tools". Reword the default-grant paragraph without the source path.
3. In the caller-side dispatcher paragraph, state that `file write` and `file edit` also bypass the dispatcher and run through the same workspace runner as the typed command, on the local tab or on the far side of a remote-hosted loop.

## Tests

No code changes; spec wording is not covered by tests. Verify by rereading the three file subsections against the tool table, prompt runner, and remote loop, and run check-diff.

## Out of scope

The second backlog entry (trailing-separator paths); any code change.
