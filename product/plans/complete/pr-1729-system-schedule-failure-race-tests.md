# PR 1729: cover system-schedule recovery and lifecycle failures

**Complexity: 6/10** — add deterministic coverage for persisted owner failure ordering, asynchronous firing races, and real server startup gates across three existing test suites.

## Goal

Pin the persisted system-schedule failure and lifecycle guarantees already defined by the implementation plan and `product/specs/scheduling.md`, without changing production behavior.

## Approach

Extend the system schedule manager and recovery tests for due-run save failures, invalid and unsupported stores, script-read outcomes, shell failures and retries, independent due keys, and cancellation/disposal during deferred preparation. Extend `src/index.test.ts` to exercise startup order around delayed shell preparation and recovery, and to verify storage or managed-shell failure does not prevent remote reattachment or listening. Assertions will cover the queue, persisted snapshot, and user notices where relevant.

Keep these as tests of the shipped behavior. If a test exposes a production defect, stop before expanding the implementation scope and revise this plan first.

## Implementation steps

1. Promote this plan to `product/plans/ready/` before editing tests.
2. Add focused owner and boot-recovery cases in `src/schedule/system/manager.test.ts` and `src/schedule/system/boot-recovery.test.ts`.
3. Add deterministic startup-order and failure-isolation cases in `src/index.test.ts`.
4. Run `./scripts/run.mjs check-diff` and inspect the scheduling spec and documented behavior for drift.
5. Promote the plan to `product/plans/complete/`, remove only the selected PR backlog entry, and publish to the existing PR branch.

## Tests

- Boot recovery save failure retains due rows in memory and on disk, emits no missed notice, and prevents live firing.
- Missing, invalid, and unsupported store reads have the documented empty-state/reporting behavior and do not rewrite invalid data.
- Missing scripts advance/remove and notify only after persistence; unreadable scripts leave the entry due without queue additions or run notices.
- Shell ensure failure leaves the row due, reports the shell failure once, and a later successful ensure persists then queues it.
- Multiple due keys progress independently when one script cannot be read or one ensure attempt fails.
- Cancellation and disposal during deferred script reads or shell preparation never enqueue stale work or restore removed rows.
- Server startup performs no scheduler start/fire before shell preparation and recovery complete; storage and system-shell failures do not prevent remote reattachment and listening.
- Test assertions pin queue rows, persisted snapshots, notices, startup ordering, and listener availability.

## Spec and documentation

`product/specs/scheduling.md` already states the tested behavior. Confirm it still matches; no prose update is needed unless the tests reveal a specification gap. User-visible behavior is unchanged, so no help or user-documentation update is expected.

## Out of scope

- Production behavior or implementation changes unless a defect is found; revise this plan before any such change.
- Schedule grammar, UI, command behavior, queue persistence, or documentation of new behavior.
- Changes to the PR title or description, merging, closing, or publishing to another branch.
