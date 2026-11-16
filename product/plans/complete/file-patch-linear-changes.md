# Derive patch changes in linear time

**Complexity: 2/10** — one production file, three requirements, and three scenarios (p=3.75)

## Goal

Avoid repeated scans of patch places when deriving content writes.

## Approach and implementation

In `src/file-patch/changes.ts`, collect removed place locations once and use the set to filter writes. Preserve write order and existing delete and symbolic link behavior.

## Tests and verification

In `src/file-patch/sections.test.ts`, cover retained and removed entries and updating through a link followed by deleting it. Add focused coverage of a large collection that verifies places are traversed only a constant number of times. Run diff-scoped checks.

## Out of scope

Patch section semantics and user-visible behavior remain unchanged.
