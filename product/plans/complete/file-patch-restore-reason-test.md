# Verify the original patch failure reason after failed restoration

**Complexity: 1/10** — one behavioral requirement and one test scenario, with no production changes (p=2.32)

## Goal

Verify a failed restore retains the original write failure reason while remaining undo operations run.

## Approach and implementation

Extend the existing failed-restore scenario in `src/file-patch/commit.test.ts` with distinct write and undo error codes. Assert the original write error's literal mapped reason alongside the existing path, restored flag, and file state assertions.

## Tests and verification

Run the commit tests and diff-scoped checks. This adds coverage only and changes no user-visible behavior, spec, or documentation.

## Out of scope

Changing commit behavior or filesystem error mappings.
