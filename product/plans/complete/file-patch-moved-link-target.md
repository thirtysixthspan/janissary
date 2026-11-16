# Resolve moved patch links from their destination

**Complexity: 6/10** — ~105 added lines, 7 production files and 9 behavioral requirements (p=6.00)

## Goal

Make later sections follow a moved symbolic link from its new parent, under the existing workspace and protected-path policies, without changing its link text.

## Approach

Add a view operation that resolves a link's lexical target relative to its current place through the existing path policy and in-memory view. Follow links through that operation on each section, detect cycles and missing targets, and return policy failures instead of silently retaining stale content. Preserve the rename and pre-move hunk behavior. Keep the move registry's link identity separate from the content followed after a move.

## Implementation

- Update `src/file-patch/view.ts` to expose resolution of a link target relative to its place and adapt view test doubles.
- Update `src/file-patch/section-steps.ts`, `src/file-patch/sections.ts`, and `src/file-patch/moves.ts` to follow current target chains and propagate failures, without copying old link target metadata to the destination.
- Update `src/file-patch/move-chains.ts` to reindex a surviving link chain when following it changes its content identity, preserving subsequent hops and rename reporting.
- Track implicitly resolved link targets in `src/file-patch/view-entry.ts` and `src/file-patch/view.ts` so `src/file-patch/rows.ts` reports only paths named by sections, promoting a target to explicit when a later section names it.
- Add regression cases in `src/file-patch/sections.test.ts` for a moved link with a different destination target, missing target, outside or protected target, and an in-memory added target. Retain link, chain, and move cases.
- Run diff-scoped checks and the relevant tests. This internal behavior is not yet user-visible; no spec or public help change is needed at this stage.

## Out of scope

Changes to the patch grammar, disk commit, or link text.
