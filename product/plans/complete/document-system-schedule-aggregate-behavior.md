# Fix: document system schedule persistence and aggregate deletion

**Complexity: 2/10** — this is a documentation-only correction across the startup guide, scheduling guide, and scheduling spec. The implementation already persists project schedules, includes them in the aggregate list, and uses keyed deletion for individual system rows.

## Goal

Describe the different lifetimes of tab-owned and project-owned schedules accurately, and explain how aggregate system rows can be focused and deleted without implying that one row action removes every duplicate-name schedule.

## Approach

Clarify in the startup guide that tab-owned schedules disappear on launch while project system schedules persist. Update the aggregate-list sections in the user guide and spec to include project schedules even when the managed system shell is not visible, explain that focusing a system row reveals or recovers that shell, and distinguish per-row keyed deletion from `schedule system cancel <name>`. Keep tab-row deletion behavior tied to its existing tab schedule cancellation path.

## Implementation steps

1. Update `documentation/user-documentation/getting-started/startup.md` to distinguish tab-owned schedule loss from persistent project system schedules.
2. Update the aggregate-list section of `documentation/user-documentation/automation/scheduling.md` with system-row inclusion, focus, and deletion behavior while retaining tab-owned deletion guidance.
3. Update the aggregate-list section of `product/specs/scheduling.md` with the same owner-specific behavior and exact deletion semantics.
4. Remove only the resolved first entry from `product/backlog/pull-request.md` and promote this plan to `product/plans/complete/`.

## Tests

No new tests are needed for this documentation-only correction. Run `./scripts/run.mjs check-diff` after each implementation step to verify the changed-file workflow.

## Out of scope

- Changing schedule storage, aggregate rows, focus behavior, or deletion implementation.
- Editing the second pull-request backlog entry or the pull-request description.
