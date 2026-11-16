<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Repair the completed subplan links that still point at the completion plan's previous location.

Existing Issue: Moving `product/plans/ready/web-search-14-completion.md` to `product/plans/complete/web-search-14-completion.md` leaves five references to the old ready path in four completed subplans: `product/plans/complete/web-search-1-command-grammar.md`, `product/plans/complete/web-search-6-search-core.md`, both the behavior-spec bullet and the out-of-scope bullet of `product/plans/complete/web-search-10-typed-command.md`, and `product/plans/complete/web-search-12-acp-tool.md`. Severity: 3/10

Existing Risk: 3/10 - A reader or agent following the subplan chain for the final slice lands on a path that no longer exists and has to search the plans directory, and any later link check over `product/plans/complete/` reports the same five dead references.

Proposal Risk: 1/10 - Only link text changes, so no behavior can regress; the residual risk is mistyping the destination, which reading each edited line against the files in `product/plans/complete/` catches.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "repoint the completion plan references at its new complete path". In `product/plans/complete/web-search-1-command-grammar.md` (the out-of-scope Completion bullet), `product/plans/complete/web-search-6-search-core.md` (the process-wide registry design decision), `product/plans/complete/web-search-10-typed-command.md` (the behavior-spec design decision and the out-of-scope Completion bullet), and `product/plans/complete/web-search-12-acp-tool.md` (the out-of-scope Completion bullet), replace `./product/plans/ready/web-search-14-completion.md` with `./product/plans/complete/web-search-14-completion.md`. Leave the pre-existing stale references to `./product/plans/ready/web-search-12-acp-tool.md` and `./product/plans/ready/web-search-13-default-grants.md` alone; they predate this commit and belong to a separate cleanup. Verify by searching the repository for `./product/plans/ready/web-search-14-completion.md` and confirming no match remains, and by confirming each edited link names the moved plan under `product/plans/complete/`.
