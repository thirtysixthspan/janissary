# Cover symbolic link content paths

**Complexity: 1/10** — One test scenario and no production code changes (p=1.83).

## Goal

Verify that a symbolic link's content entry records the canonical target path while its place records the link location.

## Approach and implementation

Extend the existing in-root link case in `src/file-patch/view.test.ts` with an explicit assertion against the target's canonical path. Preserve the location, shared-content, and read-once checks.

## Tests and verification

Run the view test and `$janissary/scripts/run.mjs check-diff`.

## Out of scope

Production behavior and user-visible documentation are unchanged.
