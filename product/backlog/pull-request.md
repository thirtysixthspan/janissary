<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Close the plan-fidelity gap left by the plan promotion: plans that depend on the result-rendering slice still point at its old ready-folder path.

Existing Issue: The commit promotes `product/plans/ready/web-search-2-result-rendering.md` to `product/plans/complete/`, but five plans that depend on it — `product/plans/ready/web-search-3-provider-tokens.md`, `product/plans/ready/web-search-4-bundled-providers.md`, `product/plans/ready/web-search-5-provider-registry.md`, `product/plans/ready/web-search-6-search-core.md`, and `product/plans/complete/web-search-1-command-grammar.md` — still reference the old `ready/` path, so those dependency links no longer resolve. Severity: 3/10

Existing Risk: 3/10 - The next agent implementing a dependent slice follows a broken path and must rediscover the contract and rendering decisions, and the plan graph keeps pointing at a file that is no longer there.

Proposal Risk: 1/10 - The references resolve after the edit, but no automated link check exists, so a future plan promotion can leave the same breakage behind.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "update the plan cross-references left stale by the result-rendering plan's promotion". Replace every `./product/plans/ready/web-search-2-result-rendering.md` with `./product/plans/complete/web-search-2-result-rendering.md` in `product/plans/ready/web-search-3-provider-tokens.md` (one occurrence), `product/plans/ready/web-search-4-bundled-providers.md` (three occurrences: the intro, the dependency bullet, and the out-of-scope bullet), `product/plans/ready/web-search-5-provider-registry.md` (one), `product/plans/ready/web-search-6-search-core.md` (one), and `product/plans/complete/web-search-1-command-grammar.md` (one). Change only those path strings; leave the surrounding prose, the moved plan's own body (its reference to `ready/web-search-1-command-grammar.md` is pre-existing and outside this fix), and every source, test, and spec file untouched. Verify with `grep -rn "plans/ready/web-search-2-result-rendering" product` returning no matches and re-read each edited bullet to confirm it still names the same types and functions; no test command is needed because no behavior changes.
