<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Reuse the plan's fake remote channel harness instead of duplicating it across the four executor test files

Existing Issue: Each of the four executor test files carries its own near-identical copy of the fake remote channel harness even though the subplan directs the tests to reuse the existing harness, leaving five copies of the same scaffolding to maintain. Severity: 5/10

Existing Risk: 4/10 - A change to the channel protocol or reply shape is applied unevenly across the copies, so one executor's remote tests can silently stop matching the real transport while the others still pass.

Proposal Risk: 2/10 - A single shared harness is exercised by every executor test, so a wiring mistake fails those tests immediately; the only residual risk is matching the shared harness's reply shape to the canonical one.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2115 "share the fake remote channel harness across the four executor test files". Extract the fake-channel helper (and its RequestFrame type) from src/commands/file.test.ts into a single test-only shared module and export it, then import that helper in src/commands/file.test.ts and in the four executor test files src/file-list/tab-list.test.ts, src/file-stat/tab-stat.test.ts, src/file-exists/tab-exists.test.ts, and src/file-head-tail/tab-head-tail.test.ts, deleting each local copy. Keep the shared helper's listener accessor and filesystem-request guard identical to the canonical harness so the reply path is unchanged. The existing executor remote-tab assertions — operation names and args, session prefixes, refusal wording, absolute-path handling, and the unavailable line — are the behavior that must not move; run those four test files plus src/commands/file.test.ts to verify. No production code changes.
