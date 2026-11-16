<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the tab-completion spec's web flag rule, which never states that the flags are offered only after the query.

Existing Issue: The new `### Web command` section says a word starting with `-` after `web search` offers the flags not already used, while `completeWebCommand` offers them only when the dash is not the first word after `web search`, so `web search -` has no candidates and the condition is never stated. Severity: 2/10

Existing Risk: 2/10 - A reader or future test author trusting the spec will expect Tab on `web search -` to list the four flags and either report a false bug or write a test the implementation fails, while the user doc and `product/specs/web-search.md` already word the rule correctly.

Proposal Risk: 1/10 - The corrected sentence would match the code, but the completion still keys the flag branch on argument position rather than a parsed query, so an invalid line such as `web search --results 3 -` offers flags without a query and the revision must not claim more than the code does.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "state the after-the-query condition in the tab-completion spec's web flag rule". In `product/specs/tab-completion.md`, under the `### Web command` section, rewrite the Candidates sentence for flags so it says the flags complete only after the query, with the dash not the first word after `web search`, and name `web search -` as leaving the line unchanged with no candidates. Leave the rest of the section intact: the first-argument `search` rule, the `--depth` and `--provider` value rules, the `--results` and `--max-chars` no-candidate rule, the disabled-row behavior, and the case-sensitivity note all match `src/completion/web.ts`'s `completeSearchArgument` and the tests in `src/completion/web.test.ts`. No code or test change is needed. Verify by reading the section against the `web search -` and `web search foo -site:x` cases in `src/completion/web.test.ts`, and confirm the wording agrees with the `After web` row in `documentation/user-documentation/command-bar/tab-completion.md` and the completion sentence in `product/specs/web-search.md`.


* Repair the completed subplan links that still point at the completion plan's previous location.

Existing Issue: Moving `product/plans/ready/web-search-14-completion.md` to `product/plans/complete/web-search-14-completion.md` leaves five references to the old ready path in four completed subplans: `product/plans/complete/web-search-1-command-grammar.md`, `product/plans/complete/web-search-6-search-core.md`, both the behavior-spec bullet and the out-of-scope bullet of `product/plans/complete/web-search-10-typed-command.md`, and `product/plans/complete/web-search-12-acp-tool.md`. Severity: 3/10

Existing Risk: 3/10 - A reader or agent following the subplan chain for the final slice lands on a path that no longer exists and has to search the plans directory, and any later link check over `product/plans/complete/` reports the same five dead references.

Proposal Risk: 1/10 - Only link text changes, so no behavior can regress; the residual risk is mistyping the destination, which reading each edited line against the files in `product/plans/complete/` catches.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "repoint the completion plan references at its new complete path". In `product/plans/complete/web-search-1-command-grammar.md` (the out-of-scope Completion bullet), `product/plans/complete/web-search-6-search-core.md` (the process-wide registry design decision), `product/plans/complete/web-search-10-typed-command.md` (the behavior-spec design decision and the out-of-scope Completion bullet), and `product/plans/complete/web-search-12-acp-tool.md` (the out-of-scope Completion bullet), replace `./product/plans/ready/web-search-14-completion.md` with `./product/plans/complete/web-search-14-completion.md`. Leave the pre-existing stale references to `./product/plans/ready/web-search-12-acp-tool.md` and `./product/plans/ready/web-search-13-default-grants.md` alone; they predate this commit and belong to a separate cleanup. Verify by searching the repository for `./product/plans/ready/web-search-14-completion.md` and confirming no match remains, and by confirming each edited link names the moved plan under `product/plans/complete/`.
