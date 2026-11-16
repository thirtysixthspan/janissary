<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the remote-server spec's claim that a failed provider is always reported in the failure lines, which omits the silent successful-fallback case.

Existing Issue: The version-44 paragraph in `product/specs/remote-server.md` says a provider failure on the far side "is reported only in the failure lines", but a remote search that falls back to a later provider prints only the winner's results; the precise behavior in `product/specs/web-search.md` and `help/web.md` is that a provider disabled or failed before a successful fallback is reported nowhere. Severity: 3/10

Existing Risk: 3/10 - A reader implementing or troubleshooting the far-side operation relies on a failure line that never appears, so a silent provider failure looks like a working search and the reason is lost.

Proposal Risk: 1/10 - The spec states the silent case explicitly; the only residual ambiguity is how a whole-search failure is phrased, which already has an exact formatter in `src/web-search/failure-lines.ts`.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "correct the remote-server spec's provider-failure reporting claim". Rewrite that sentence in `product/specs/remote-server.md` to distinguish the two outcomes: a search that ends in failure returns the `formatFailures` single-failure or every-provider-failed lines, while a provider that fails before a later provider succeeds leaves no failure line and no notification, because the far side passes no `reportDisabled`. Cross-check the wording against the Disabled providers section of `product/specs/web-search.md`, the Providers section of `help/web.md`, and the reporter-less calls in `src/remote/serve-acp-loop.ts` and `src/remote/filesystem/web-search-operation.ts`. Leave the paragraph's argument-shape and long-running-deadline sentences untouched; no code or test change is needed.


* Correct the web help page's absolute "no cancellation" claim, which is true only for typed searches and not for agent searches.

Existing Issue: `help/web.md` says "A search has no cancellation: it runs until it answers or every provider it tries times out", but a search an `ask` or `tell` agent runs is tied to the prompt's abort signal, is aborted at once when the prompt is cancelled or reset, starts no further provider, and has its late result suppressed, as `product/specs/acp.md` and `product/specs/web-search.md` state. Severity: 3/10

Existing Risk: 2/10 - A person reading the help page believes an agent's search cannot be stopped and waits for a slow provider, or assumes the page's statement covers the agent tool when only typed searches are uncancellable.

Proposal Risk: 1/10 - The page will distinguish the two cases; the only residual risk is describing the local-fallback remote session too tersely, which the ACP spec's cancellation wording can be quoted for.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "correct help web's no-cancellation claim to distinguish typed and agent searches". Rewrite the opening paragraph of `help/web.md` so the no-cancellation sentence begins "A typed search has no cancellation"; add one sentence that a search run by an agent is cancelled with its prompt, aborts the in-flight provider request, starts no further provider, and has its late result suppressed, noting that a local-fallback session's remote search has no cancel message and only its late result is suppressed. Keep the rest of the page's remote-routing and provider behavior unchanged. Verify against the typed-search and agent-tool sections of `product/specs/web-search.md`, the Cancellation paragraph of `product/specs/acp.md`, and the signal handoff in `src/acp/run-prompt.ts` and `src/remote/serve-acp-loop.ts`; no code or test change is needed.


* Correct the ACP spec's statement that disabling the file row disables its four commands, when the vocabulary has five.

Existing Issue: `product/specs/acp.md` says disabling the parent `file` row disables its four commands, but `NATIVE_ACP_COMMANDS` in `src/plugins/roles/shared.ts` lists five file commands (file read, file glob, file grep, file write, file edit), and `product/specs/application-commands.md` already says disabling `file` disables all five. Severity: 2/10

Existing Risk: 2/10 - The stale count understates the parent row's blast radius and contradicts the application-commands spec, so a reader deciding whether to disable `file` cannot tell which commands will stop working.

Proposal Risk: 1/10 - The count becomes accurate; the only residual risk is another place carrying the same stale four-command claim, which a search for "four commands" and "all four" should catch.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "correct the ACP spec's four-command file claim". In the Web search section of `product/specs/acp.md`, change "as disabling `file` disables its four commands" to name the five file commands or say all five. Search `product/specs`, `help`, and `documentation` for other four-command or four-native file-row counts and correct any that describe the current vocabulary; leave historical plans that describe an earlier state alone. Verify the final sentence against `NATIVE_ACP_COMMANDS` and the five-row paragraph in `product/specs/application-commands.md`; no test change is needed because this is prose.


* Remove the stale pre-delivery size estimate from the canonical web-search plan, which no longer matches the delivered change.

Existing Issue: `product/plans/complete/web-search.md` still opens with "~920 added lines, 23 files edited, 44 requirements, 62 test scenarios (p=8.74)", while the branch changes 105 files with 4,587 insertions and folds 43 subplans and repair plans into this one; the header describes the original estimate, not the delivered plan. Severity: 2/10

Existing Risk: 3/10 - A reader uses the plan's size estimate to judge review effort or risk and under-scopes a change roughly four times larger than stated, and a future plan comparison carries the wrong baseline.

Proposal Risk: 1/10 - The plan will no longer carry a stale statistic; the only residual risk is choosing a replacement count that immediately goes stale, so removing the numeric estimate is safer than restating it.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "remove the web-search plan's stale size estimate". In the first line of `product/plans/complete/web-search.md`, keep the `Complexity: 8/10` rating but remove the parenthetical `~920 added lines, 23 files edited, 44 requirements, 62 test scenarios (p=8.74)`, which came from the pre-decomposition ready plan and is contradicted by the delivered diff. If a substitute is wanted, state only stable facts such as "fourteen feature slices, with the completed subplans and repair plans folded in" rather than a line, file, or test count that drifts; do not alter the goal paragraph or the design decisions. Verify by reading the first three lines and, if a current count is needed for the report, use `git diff --stat origin/master...HEAD`; no code or test change is needed.
