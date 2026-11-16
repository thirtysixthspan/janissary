<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Complete the plan promotion by repointing the six completed repair plans that still link to the typed-command subplan at its old ready path.

Existing Issue: `product/plans/complete/web-search-activation-failure-classification.md`, `product/plans/complete/web-search-provider-page-remote-plan-link.md`, `product/plans/complete/web-search-provider-page-disabled-resolution-lines.md`, `product/plans/complete/web-search-provider-page-token-row.md`, `product/plans/complete/web-search-provider-page-expected-failure-fallback.md`, and `product/plans/complete/web-search-per-attempt-request.md` still reference `./product/plans/ready/web-search-10-typed-command.md`, which this commit moved to `product/plans/complete/`, leaving nine broken links across those six files. Severity: 3/10

Existing Risk: 3/10 - A reader following the repair history reaches a missing plan and cannot tell whether the typed-command work was abandoned, moved, or never written.

Proposal Risk: 1/10 - The links resolve again; the surrounding sentences still describe the behavior spec as deferred, which is historical wording rather than a live path.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "repoint the completed repair plans at the promoted typed-command subplan". In each of `product/plans/complete/web-search-activation-failure-classification.md` (three references), `product/plans/complete/web-search-provider-page-remote-plan-link.md` (one), `product/plans/complete/web-search-provider-page-disabled-resolution-lines.md` (one), `product/plans/complete/web-search-provider-page-token-row.md` (one), `product/plans/complete/web-search-provider-page-expected-failure-fallback.md` (two), and `product/plans/complete/web-search-per-attempt-request.md` (one), change `./product/plans/ready/web-search-10-typed-command.md` to `./product/plans/complete/web-search-10-typed-command.md`. Leave the historical sentences that say the behavior spec was deferred at the time of the repair; only the path changed. Verify with `grep -rn "plans/ready/web-search-10" product` and confirm no matches, and keep the change to those six plan files with no source, test, spec, or help edit.


* Correct the plan's promised behavior spec and help page, which claim a disabled provider's failure line always reaches the search output even when a fallback succeeds.

Existing Issue: The new `product/specs/web-search.md` says the disabled-provider notification is not added to the transcript because the search output already carries the failure line, and the new `help/web.md` says a remote search reports the reason only in its failure lines, while `src/web-search/search.ts` returns the first successful provider's rendered results and drops the accumulated failures, so a provider disabled before a fallback success appears in neither the results nor the far-side output. Severity: 4/10

Existing Risk: 4/10 - A person on a remote tab sees a successful result list and never learns that a provider was disabled for the rest of the far-side process, so a later search can silently skip that provider or fail with no clue why.

Proposal Risk: 2/10 - The documentation would match the code, but a remote fallback success still reports the disable nowhere unless a later change carries the reason over the wire.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "make the disabled-provider documentation match a successful fallback". Rewrite the last paragraph of the "Disabled providers" section in `product/specs/web-search.md` and the last paragraph of `**Providers**` in `help/web.md` to state the actual rule: a local search posts the one notification even when a later provider succeeds, and the search output prints only the winner; a remote search posts nothing, so a provider disabled during a successful fallback is reported nowhere until a later failure line names it. Keep the remote limitation explicit rather than implying a failure line always exists. Do not change `src/web-search/search.ts`, `src/web-search/tab-search.ts`, or the remote operation; `src/web-search/search.test.ts` already pins "auto falls back after ... and prints only the winner" and `src/web-search/tab-search.test.ts` already pins the local notification, so no test edits are needed unless the wording change moves a quoted string. Verify by reading both pages against those two tests and confirming no other new file repeats the claim.


* Correct the pull request description's claim that the new web-search feature directory knows nothing about tabs or the remote channel, which the new tab adapter contradicts.

Existing Issue: The description says the new `src/web-search/` feature directory "knows nothing about tabs, ACP, or the remote channel", while this commit adds `src/web-search/tab-search.ts`, which imports `Managers`, `localReadRoot`, `withRemoteTabPort`, and `notify` and chooses between a local search and the tab's remote port. Severity: 2/10

Existing Risk: 2/10 - A reviewer uses the description's boundary claim to judge the directory and misses that one module already carries host and remote dependencies, so a later refactor can move that logic into `search.ts` without noticing the boundary.

Proposal Risk: 1/10 - The description states the intended boundary, but the tab adapter still lives in the directory; that is the plan's design, now visible.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "correct the description's claim that the web-search directory is host-free". Rewrite the sentence in the pull request body that introduces `src/web-search/` so it says the search core there stays free of tabs, ACP, and the remote channel while one small tab-adapter module chooses the local or remote side and posts the local disabled-provider notification. Match the plan's own design decision: `src/web-search/search.ts` is host-free and `src/web-search/tab-search.ts` is the only module in the directory that knows about tabs. Change no source, test, spec, or plan file for this wording fix.

