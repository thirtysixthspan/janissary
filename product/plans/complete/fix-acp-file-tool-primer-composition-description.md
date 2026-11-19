# Fix ACP file-tool primer composition description

**Complexity: 1/10** — spec-only prose correction, no production code, files, requirements, test scenarios, or new units (p=1.58)

## Goal

Make the "File write and edit tools" paragraph in `product/specs/acp.md` describe the file tool's primer composition with the same complete enumeration of blocks that the already-accurate "When a role grants file read" paragraph and the newer tool sections give, so the two accounts of the same observable primer agree.

## Design decisions

- This is a spec-only correction: no production code, primer text, or command behavior changes. The primer code blocks stay byte-for-byte unchanged.
- The authoritative enumeration is the "When a role grants file read" paragraph (the one beginning "When a role grants `file read`, the read part of the file tool's primer is exactly the text below"), corroborated by the "File glob", "File patch tool", "File list tool", and "File stat, exists, head, and tail tools" sections. Its order is: read, glob, grep, mutation (write or edit), patch, list, stat, exists, head, tail, each separated by a blank line.
- Leave the "When a role grants file read" paragraph and the newer tool sections untouched; change only the primer-composition sentence in the "File write and edit tools" paragraph.

## Implementation steps

1. In `product/specs/acp.md`, in the "File write and edit tools" paragraph, replace the sentence that currently composes the primer from read, glob, grep, and mutation blocks only with one that lists, in this order: the read primer when `file read` is granted, then the glob primer when `file glob` is granted, then the grep primer when `file grep` is granted, then the mutation primer when `file write` or `file edit` is granted, then the patch primer when `file patch` is granted, then a primer for each of `file list`, `file stat`, `file exists`, `file head`, and `file tail` when that name is granted, each separated by a blank line.
2. Keep the closing clause that a role granting only a mutation gets no read text.
3. Re-read both paragraphs to confirm they enumerate the same ten blocks in the same order.

## Tests

- None. No test covers spec prose, so verification is by careful reading plus `$janissary/scripts/run.mjs check-diff`.

## Verification

- Re-read the "File write and edit tools" and "When a role grants file read" paragraphs and confirm both enumerate read, glob, grep, mutation, patch, list, stat, exists, head, and tail blocks in the same order, each separated by a blank line.
- Confirm no production file, primer code block, or other spec section changed.
- Run `$janissary/scripts/run.mjs check-diff` after the edit and confirm it is clean.

## Out of scope

- Any production code change, any change to primer text, any change to the "When a role grants file read" paragraph or the newer tool sections, any new command or behavior, and any help or user-documentation update.
