<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the commit's claim that every plan cross-reference to the promoted subplan was repointed, because one completed plan still links twice to its former location.

Existing Issue: The commit moved the remote-operation subplan from `product/plans/ready/` to `product/plans/complete/` and repointed most cross-references, but `product/plans/complete/web-search-provider-page-expected-failure-fallback.md` still names `./product/plans/ready/web-search-7-remote-operation.md` in its dependency list and its closing verification sentence, and that path no longer exists on the branch. Severity: 2/10

Existing Risk: 3/10 - A reader or a later plan-following invocation that uses either link to learn the far-side `reportDisabled` rule lands on a missing file and must guess the new location, so the constraint that prompted the link can be silently dropped from the work it was meant to inform.

Proposal Risk: 1/10 - Both links resolve again; the only residual hazard is the same kind of miss during a future promotion, which a repository-wide search for the old path at move time would catch.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "repoint the completed provider-page plan at the promoted remote-operation subplan". In `product/plans/complete/web-search-provider-page-expected-failure-fallback.md`, the `## Issue` bullet that groups `web-search-5-provider-registry.md` with `./product/plans/ready/web-search-7-remote-operation.md`, and the final paragraph that names the same file beside `src/web-search/registry.ts` and `web-search-6-search-core.md`, both need the second path changed to `./product/plans/complete/web-search-7-remote-operation.md`. Touch nothing else: the claims in that plan about `reportDisabled`, the far-side failure lines, and the completed search core are accurate and the plan is complete. Verify with a repository-wide search for `ready/web-search-7-remote-operation` that returns no matches, and confirm every remaining `web-search-7-remote-operation` reference resolves under `product/plans/complete/`; no code or test behavior is involved, so no further check is needed.
