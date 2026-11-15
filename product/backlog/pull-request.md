<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request


* Deliver the plan's timeout-while-seeking-a-sentinel test, which never reaches the limit its own name claims.

Existing Issue: The scan deadline suite's "returns timeout while seeking a sentinel after exactly the limit" case runs with the default limit of 100 while its worker returns a single row, so it covers a partial result timing out rather than the exactly-limit state the plan requires. Severity: 2/10

Existing Risk: 2/10 - The plan-required combination of exactly the requested limit plus a timeout during the sentinel search stays unpinned, so a later change to that continuation can change the timeout outcome without a failing test.

Proposal Risk: 1/10 - The work touches one test case under fake timers and no production code, so the only residual risk is the case drifting from the scan's real ordering, which the retained-row and reader-call assertions keep visible.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2005 "make the scan's exactly-limit sentinel-search timeout test exercise the state it names". In `src/file-grep/scan.test.ts`, the `scanFiles deadlines` case "returns timeout while seeking a sentinel after exactly the limit" builds its arguments with `args()`, which sets the default limit of 100, while its worker returns one row, so the read that times out is an ordinary next-candidate read and not a sentinel search. Pass `args({ limit: 1 })` to that `scanFiles` call so the first candidate's single row reaches exactly the limit and the pending second read is the sentinel search, keep the existing expectation that the earlier row is retained with the timeout ending, and add `expect(reader).toHaveBeenCalledTimes(2)` so the case also proves the scan continued past the limit instead of stopping there. Change nothing in `src/file-grep/scan.ts`, `src/file-grep/deadline.ts`, or `src/file-grep/read-candidate.ts`; the neighbouring "continues after exactly the limit and finds a later sentinel" and "exhausts remaining candidates after exactly the limit without a sentinel" cases must keep passing unchanged.
