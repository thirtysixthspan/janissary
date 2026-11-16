# Preserve operations on moved dangling links

**Complexity: 2/10** — 5 requirements and 5 test scenarios across one production file (p=4.34)

## Goal

Allow a previously validated link moved within a patch to be deleted or moved again even if its destination-relative target is missing, while retaining policy validation for content operations and initially dangling links.

## Approach

In `src/file-patch/sections.ts`, identify link places with a current recorded move chain. Skip following only for Delete and Update with a move and no hunks on those links. Continue resolving source and destination paths and following links in all other cases.

## Implementation

1. Select whether following is needed before dispatching each section, using the move registry to distinguish previously validated moved links.
2. Extend `src/file-patch/sections.test.ts` to cover deletion, another move, update and move with hunks after a link becomes dangling, and initial dangling-link rejection.
3. Run diff-scoped checks and retain the remaining PR backlog entry.

## Tests

Cover a moved dangling link followed by deletion, another move, a content update, and a move with hunks, plus an initially dangling link. Check changes and net rows as well as error reasons.

## Out of scope

Changes to initial dangling-link policy, other patch semantics, and unrelated protected-target coverage.
