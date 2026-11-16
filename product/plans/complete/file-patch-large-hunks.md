# Handle large patch hunks

**Complexity: 2/10** — one production file, three requirements, and three scenarios (p=3.84)

## Goal

Apply valid large hunks without exceeding JavaScript's argument-count limit.

## Approach and implementation

Replace the unbounded splice argument spread in `src/file-patch/hunks.ts` with forward assembly of original lines and replacements. Preserve original positions, same-position insertion order, and existing newline handling.

## Tests and verification

Add a regression in `src/file-patch/hunks.test.ts` applying over 200,000 short added lines within the patch size limit and assert the entire output. Preserve existing sequential and same-position insertion tests. Run the diff-scoped checks.

## Out of scope

Patch size limits and matching semantics remain unchanged.
