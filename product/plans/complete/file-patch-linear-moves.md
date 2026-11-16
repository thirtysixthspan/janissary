# Avoid quadratic work in patch moves

**Complexity: 5/10** — ~65 added lines, 5 production files, 6 requirements and 7 scenarios (p=5.43)

## Goal

Keep move tracking and change reporting efficient as the number of moves grows, preserving existing results.

## Approach

- Index chains by their current place and content, remember vacated places, and assign increasing hop order as moves are recorded.
- Index surviving chains by content for writes, and renames by origin and destination for rows, preserving first-match and insertion order.
- Keep existing chain, link, exchange, and net-row semantics.

## Implementation

Update `src/file-patch/move-chains.ts`, `src/file-patch/moves.ts`, `src/file-patch/changes.ts`, `src/file-patch/rows.ts`, and `src/file-patch/sections.ts` to maintain and consume the indexes. Update record fixtures as necessary.

## Tests

Retain existing move-chain, exchange, link and net-row tests. Add focused coverage with many chains and moves that counts accesses and checks order and survival without repeated scans. Run diff-scoped checks.

## Out of scope

Changes to symbolic-link destination resolution or user-visible patch behavior.
