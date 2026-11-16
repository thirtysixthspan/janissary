# Index patch folder reporting paths

**Complexity: 3/10** — one production file, four requirements and five scenarios (p=4.35)

## Goal

Avoid repeated full change scans when determining the typed path reported for folder creation failures.

## Approach and implementation

In `src/file-patch/commit.ts`, index the first applicable requested path for each planned folder by walking ancestors of move destinations followed by write targets. Preserve strict-descendant matching, rename precedence, first-place ordering, empty fallback, and existing rollback and failure behavior.

## Tests and verification

Extend `src/file-patch/commit.test.ts` to cover nested and shared folders, rename versus write precedence, unrelated paths and an unmatched folder, and a large collection with instrumented place access proving changes are not scanned per folder. Run diff-scoped checks.

## Out of scope

Patch mutation semantics, error wording, and public behavior remain unchanged.
