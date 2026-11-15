# Correct the ACP spec's stale section references
**Complexity: 1/10** — documentation-only prose fix; no production lines, files, requirements, scenarios, or units (p=1.57800).

## Issue

`product/specs/acp.md` routes readers to the wrong section in two places, both in **File read**.

The paragraph on roots says content search uses the remote clone "through its own read-only operation, described under File glob." The read-only operation is `grep-files`, and it is documented in **File grep**, which states the wire path rules, containment refusals, and 30-second budget. **File glob** covers path listing through `glob-paths` and explicitly leaves content search to `file grep`.

The primer paragraph says the full file-tool primer "is described under File grep and File write and edit tools." That omits **File glob**, where the glob primer is documented. The full primer is composed from four parts in `src/acp/tool-table.ts`: `FILE_READ_PRIMER`, `FILE_GLOB_PRIMER`, `FILE_GREP_PRIMER`, and `FILE_MUTATION_PRIMER`, in that order. Each part's exact text sits in its own section: read in **File read**, glob in **File glob**, grep in **File grep**, and mutation in **File write and edit tools**. So the three sections the sentence must name are File glob, File grep, and File write and edit tools.

## Goal

Point the content-search sentence at **File grep** and name all three primer sections in the primer sentence. Change nothing else: every behavioral statement, the section order, and the path-listing scope of **File glob** stay as written.

## Approach

Two prose corrections in `product/specs/acp.md`. No source, test, help, or user-documentation change is needed because behavior is already correct and the file-grep documentation audit landed in the preceding commits.

After the edits, re-read **File read**, **File glob**, **File grep**, and **File write and edit tools** against each other and against `src/acp/tool-table.ts` to confirm no remaining cross-reference sends a grep or primer reader to the wrong section. The glob section already says content search belongs to `file grep`; the grep and mutation sections already state their primer order correctly.

## Implementation steps

1. In **File read**, change "described under File glob" at the end of the content-search sentence to "described under File grep". Keep the rest of the sentence and the paragraph unchanged.
2. In **File read**, change the primer sentence's trailing "is described under File grep and File write and edit tools" to "is described under File glob, File grep, and File write and edit tools". Keep the list of primer parts in the sentence unchanged.
3. Re-read **File read**, **File glob**, **File grep**, and **File write and edit tools** in full, checking each cross-reference and each primer-order claim against `src/acp/tool-table.ts:84-87`. Confirm `File glob` still limits itself to path listing, `File grep` still carries `grep-files`, and no other reference names the wrong section.

## Tests

None new. This is a documentation correction with no behavior change. Existing `src/acp/tool-table.test.ts` cases already pin the primer order and composition, and the file-grep integration suites cover the `grep-files` operation. Run `$janissary/scripts/run.mjs check-diff` after the edit to confirm the markdown-only diff leaves lint, typecheck, and tests green.

## Specs and docs

- `product/specs/acp.md`: both stale references corrected in **File read**.
- `help/` and `documentation/user-documentation/`: checked; neither describes these internal section references, and the typed grep and ACP capability pages were corrected by earlier commits on this branch.
- The other ten pages in the file-grep documentation audit are untouched.

## Out of scope

- Any production or test change, including `src/acp/tool-table.ts` and its tests; the primer composition is already correct.
- Any behavioral statement, section order, or path-listing scope in `product/specs/acp.md`.
- Any edit to the other ten audited documentation pages.

## Verification

Run `npm run docs:build` once after the final Markdown corrections and confirm it reports no broken links. Run `$janissary/scripts/run.mjs check-diff` to confirm the markdown-only diff leaves lint, typecheck, and tests green.
