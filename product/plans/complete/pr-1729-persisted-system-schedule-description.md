# PR 1729: align the persisted system-schedule summary

**Complexity: 2/10** — verify the shipped owner and boot lifecycle, correct the PR's What and verification paragraphs, and remove one backlog entry.

## Goal

Make PR #1729 accurately describe commit `56b712a3`'s project-owned persisted system-schedule implementation while preserving the broader published-plans context, the separate earlier profile-isolation work in `43846aa7`, and every unrelated PR-body paragraph.

## Approach

Describe `SystemScheduleManager` as the project-owned schedule owner, with synchronous save-before-memory/publication commits, startup missed-run recovery after shell preparation and before the scheduler starts, and complete runscript lines appended as contiguous provenance-bearing queue batches. Identify `43846aa7` as the earlier profile-isolation change, not this implementation. In verification, distinguish the implementation and its focused server tests from the broader plan's still-unimplemented grammar, UI, and browser E2E scope. Preserve all plan-publication history and avoid implying those planned surfaces shipped.

The implementation and its functional-spec changes are already in the PR. This description-only correction does not change behavior, so no source, test, spec, or user-documentation edits are needed.

## Implementation steps

1. Promote this plan to `product/plans/ready/` before preparing the description correction.
2. Remove only the selected entry from `product/backlog/pull-request.md`.
3. Run the required diff-scoped checks, then publish the plan and backlog update to the existing PR head branch.
4. After the push, reread the PR body and update only the named What and verification paragraphs, preserving the title and every other paragraph exactly.
5. Confirm the PR remains open and its head matches the pushed branch.

## Tests

No new tests. Inspect commit `56b712a3`, its focused manager, boot-recovery, server-startup, and queue-batch tests, and the already-updated scheduling, command-queue, application-state, and state-directory specs. Run `./scripts/run.mjs check-diff` for the plan/backlog change.

## Out of scope

- Changing implementation, tests, functional specs, or user documentation.
- Rewriting the published-plans history or broader schedule feature plan.
- Claiming the planned schedule grammar, UI, or browser E2E verification shipped.
- Editing the PR title or any unrelated description paragraph.
- Merging or closing the PR.
