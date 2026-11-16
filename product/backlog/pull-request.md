<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the description's claim that a remote search reports a provider disabled during a successful fallback, which it reports nowhere.

Existing Issue: The body says a provider disabled on a remote search "reports the reason only in its failure lines", but the remote path passes no `reportDisabled` and prints only the answering provider's results, so a provider disabled before a later provider succeeds produces no line at all; the plan, web-search spec, help page, and developer page all state it is reported nowhere. Severity: 6/10

Existing Risk: 5/10 - A reviewer or operator trusts the description and expects a remote disable to be visible in output, so a provider silently staying disabled for the rest of the server process goes unnoticed and a later search can degrade or fail without the promised diagnostic.

Proposal Risk: 2/10 - The description and the code agree, but the remote silence itself remains by design, so operators still have no notification and must rely on an explicit search of the disabled provider or an all-disabled auto failure to learn the reason.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "correct the description's claim that a remote search reports a disabled provider in its failure lines". In the What section, rewrite the sentence ending "while a remote search reports the reason only in its failure lines" to say a remote search passes no disabled-provider reporter: its output prints only the provider that answered, so a provider disabled during a successful fallback is reported nowhere, and its stored reason appears only when an explicit `--provider` names it or `auto` finds every configured provider already disabled. Point to `src/web-search/tab-search.ts`, `src/remote/filesystem/web-search-operation.ts`, and `src/remote/serve-acp-loop.ts` as the paths that pass no reporter, and to `product/specs/web-search.md` and `help/web.md` for the precise wording. Do not change code; this is a description correction. Verify by reading the rewritten paragraph against those three code paths and the two docs, and confirm no other body sentence repeats the claim.


* Make a cancelled workspace clone remove only the temporary directory it owns, so the cleanup cannot delete a newer launch's clone under the same name.

Existing Issue: `provisionWorkspace` in `src/workspace/index.ts` sets a cancellation flag and, when the killed clone rejects, unconditionally removes the name-derived `target` path with `rmSync`, even though `WorkspaceManager` drops its pending attempt on cancel and a new launch can reuse that name; a delayed rejection can therefore delete the new attempt's clone, or a pre-existing directory at that path, contradicting the lifecycle promise in `product/specs/workspaced-agent.md` that an earlier attempt cannot clear a new tab's provisioning state. Severity: 5/10

Existing Risk: 4/10 - Closing a tab and immediately relaunching a workspace under the same name can make the second clone disappear or fail during provisioning, forcing a retry, and a directory that already occupied the target can be deleted.

Proposal Risk: 2/10 - Cleanup becomes owner-scoped, but the temporary sibling must be removed on every failure path and renamed atomically into place, so a missed path can leave a new leftover or a failed rename, both of which tests must pin.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "make workspace cancellation cleanup remove only the attempt's own directory". In `src/workspace/index.ts`, stop having `startGitClone` write directly into the final `target`. Create a unique provisioning sibling under the workspace base (for example `<name>.clone-<random>`), pass that path to `startGitClone`, and after a successful `ready` rename it onto `target` before `finishProvisioning(target, remoteUrl)`; if `target` already exists at rename time, fail with a clear error and do not delete it. In the rejection path, when `cancelled` is set, remove only the unique provisioning sibling, and clean that sibling on non-cancellation failures too so a failed clone leaves no new folder. Keep `ProvisionHandle.dir` as the final `target` so every caller and `WorkspaceManager` keeps its current path. Add a regression test in `src/workspace/index.test.ts` using the existing slow-git fixture: cancel attempt A after its partial directory exists, start attempt B under the same name and let it create its target before A's rejection settles, then assert B's target survives and B's `ready` resolves; also assert a pre-existing non-empty target is untouched by a cancelled attempt. The existing cancellation test, `src/workspace/manager.test.ts` pending and reuse cases, and `src/workspace/discard.test.ts` must keep passing, and the public `provisionWorkspace` signature must not change.


* Correct the pull request title and description so they identify the delivered web search feature and the workspace cancellation fix the branch also carries.

Existing Issue: The title still says the pull request decomposes the web search plan into fourteen subplans, and the body's What and How to verify sections describe only web search and never the workspace clone-cancellation change in the diff, so a reader cannot tell what else is being approved. Severity: 4/10

Existing Risk: 4/10 - A reviewer, release-notes reader, or future bisect treats the pull request as a documentation-only plan split, so the workspace provisioning behavior change ships under a misleading label and gets less scrutiny than a code change.

Proposal Risk: 1/10 - Both artifacts would describe the diff accurately; the only residual risk is a later commit changing one without the other, which the same edit pass can prevent by making both edits together.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "correct the pull request title and description to cover the delivered feature and workspace fix". Retitle the pull request as a feature change, for example `feat(web-search): add a provider-backed web search command and ACP tool`, replacing the current title that describes a plan decomposition. Keep the existing web search sections of the body and add a short paragraph under What naming the workspace cancellation fix: a cancelled workspace clone now removes its partial target so a later launch under the same name is not blocked, as `product/specs/workspaced-agent.md` and `src/workspace/index.ts` describe. Do not rewrite the behavior examples or verification steps beyond that addition. Verify with `gh pr view 2010 --json title,body` that both the title and the added paragraph are present and that no existing web search claim was lost.


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
