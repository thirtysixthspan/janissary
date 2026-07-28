# Work an Issue should explicitly hand off resolved changes to merge

**Complexity: 1/10** — clarify one existing documentation step; no runtime or test behavior changes.

## Goal

Make `ai/tasks/work-an-issue.md` explicit that the merge workflow runs after the issue has been implemented, verified, documented as needed, promoted to a complete plan, and removed from the backlog.

## Approach

Clarify the existing Step 8 heading and instruction so the task's final implementation handoff is visibly ordered and still delegates all merge behavior to `ai/tasks/workspace/merge-change-to-master.md`.

## Implementation steps

1. Update Step 8 in `ai/tasks/work-an-issue.md` to state that it follows the completed resolution and cleanup steps.

## Tests

No automated source tests are needed for this documentation-only change. Run `./scripts/run.mjs check-diff` after editing and inspect the task to confirm the merge playbook remains the final operational step before reporting.

## Out of scope

- Changing the merge workflow itself.
- Changing issue selection, implementation, testing, documentation, or plan-storage rules.
- Changing source code, tests, specs, help, or user documentation.

