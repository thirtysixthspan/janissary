# PR 1729: cover live firing for same-named system schedules

**Complexity: 3/10** — add focused regression coverage for due system schedules that share a display name but have distinct keys and scripts.

## Goal

Pin live firing, queue provenance, and persisted outcomes to each system schedule's immutable key, even when two due entries share a display name.

## Approach

Extend `src/schedule/system/manager.test.ts` with one due recurring schedule and one due one-shot schedule that have the same `id`, distinct keys, and distinct scripts. Verify one tick appends both complete script batches in schedule order with each entry's own key as provenance, advances only the recurring entry, and removes the one-shot from persisted state. Keep the existing boot duplicate-name and independent-failure tests intact.

The manager already appears to locate firing outcomes and commits by key. If the regression test exposes a production defect, revise this plan before expanding scope.

## Implementation steps

1. Promote this plan to `product/plans/ready/` before editing tests or specs.
2. Add the live duplicate-name firing case to `src/schedule/system/manager.test.ts`.
3. Update `product/specs/scheduling.md` to state that same-named system schedules fire and persist outcomes independently by key, while each queued batch keeps its originating schedule provenance.
4. Run `./scripts/run.mjs check-diff` and inspect the focused behavior and retained coverage.
5. Promote the plan to `product/plans/complete/`, remove only the selected PR backlog entry, and publish to the existing PR branch.

## Tests

- Two due entries with the same display id and different keys and scripts both append their distinct lines in order during one tick.
- Each contiguous batch carries its own schedule key in queue provenance.
- The recurring entry is advanced and remains persisted while the one-shot entry is removed independently.
- Existing boot duplicate-name recovery and independent-failure coverage remain unchanged.

## Spec and documentation

Clarify the existing system schedule firing behavior in `product/specs/scheduling.md`. User-visible behavior is unchanged, so no help or user-documentation update is expected.

## Out of scope

- Production behavior changes unless the test demonstrates a defect; revise this plan before any such change.
- Schedule parsing, interface, runscript semantics, or user documentation.
- Changes to the PR title or description, merging, closing, or publishing to another branch.
