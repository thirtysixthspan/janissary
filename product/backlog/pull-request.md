<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Close the cancellation gap: make the search core reject on every abort, including one that lands on the final provider failure or before a resolution line is returned.

Existing Issue: `runWebSearch` checks the signal only before each attempt and after a successful result, so when the only configured provider fails, or the registry returns a resolution line, while `deps.signal` is already aborted, the call resolves with failure or resolution text instead of rejecting. Severity: 6/10

Existing Risk: 6/10 - A cancelled tool step can still print a late failure or no-provider line after the user cancels, which is the late result the workspace route relies on the rejection to suppress.

Proposal Risk: 2/10 - The core then rejects on every abort it can observe; the only remaining window is an abort arriving after the final synchronous return, which cannot affect an awaited caller.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "make the search core reject on every abort". In `src/web-search/search.ts`, add `deps.signal?.throwIfAborted()` at the start of `runWebSearch` before `registry.resolveAttempts`, and replace the final `return formatFailures(failures)` with a `deps.signal?.throwIfAborted()` check followed by that return; keep the existing pre-attempt and post-results checks. The first addition covers an already-aborted signal that would otherwise return a resolution line such as `Web search: no provider configured.`, and the second covers an abort that lands during or just after the last attempt's `failed` or `plugin-failed` outcome, when no next iteration exists to catch it. Add tests to `src/web-search/search.test.ts`: one configured provider whose plain `Error` failure is accompanied by an abort (have `reportDisabled` abort the controller, as the between-attempt test does) must make `runWebSearch` reject with the abort, and a pre-aborted signal with no configured tokens must reject rather than resolve with the no-provider line. Keep the existing abort, fallback, and failure-line tests passing unchanged; `product/plans/complete/web-search-6-search-core.md` states both that a search rejects with the abort rather than returning a failure line and that once the signal aborts, `webSearch` always rejects.


* Deliver the plan's provider-names test by making its no-activation assertion able to fail.

Existing Issue: The test calls `mockRestore()` on every `activate` spy before asserting it was never called, and Vitest's `mockRestore()` resets call history, so the assertion passes even if `webSearchProviderNames()` activated a provider. Severity: 4/10

Existing Risk: 4/10 - A later change that makes the module registry activate a provider while building completion names would pass this test unnoticed.

Proposal Risk: 2/10 - The assertion can now catch activation during `webSearchProviderNames()`, but an activation performed while the module registry is created at import time would still be invisible to this test.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "make the provider-names test's no-activation assertion real". In `src/web-search/search.test.ts`, move the final loop of `expect(activation).not.toHaveBeenCalled()` assertions into the `try` block before the `finally` restores the spies, or remove the manual `mockRestore()` calls and assert in the test body while an `afterEach` calls `vi.restoreAllMocks()`. Keep the `expect(webSearchProviderNames()).toEqual(['tavily', 'tinyfish'])` assertion and the catalog spy setup. Verify the assertion can fail by temporarily making `webSearchProviderNames()` call the catalog's `activate` for one manifest and confirming the test fails, then revert that probe; the provider-names test in `product/plans/complete/web-search-6-search-core.md` requires the real catalog's names with no provider module activation.


* Finish the plan promotion by repointing the two remaining search-core links from the ready path to the complete path.

Existing Issue: The commit moves the search-core plan to `product/plans/complete/web-search-6-search-core.md`, but `product/plans/complete/web-search-provider-page-expected-failure-fallback.md` still links to `./product/plans/ready/web-search-6-search-core.md` in its dependency bullet and its final verification sentence. Severity: 3/10

Existing Risk: 3/10 - A reader or agent following the completed provider-page plan lands on a missing file and loses the behavior reference that plan says to re-read.

Proposal Risk: 1/10 - The link can go stale again if the plan is moved without a repository-wide reference check, but no behavior, prose, or plan meaning changes here.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "repoint the remaining search-core references from ready to complete". In `product/plans/complete/web-search-provider-page-expected-failure-fallback.md`, change both occurrences of `./product/plans/ready/web-search-6-search-core.md` to `./product/plans/complete/web-search-6-search-core.md`. Leave the references in `product/plans/complete/repoint-promoted-result-rendering-plan-references.md` unchanged because they describe the earlier repoint work and changing them would change that plan's meaning. Re-grep `product/plans` for `plans/ready/web-search-6` and expect no matches outside that historical plan; no source, test, or behavior change.


* Remove the shared-request debt by giving each provider attempt its own request object.

Existing Issue: `runWebSearch` creates one `WebSearchRequest` before the loop and passes the same object to every provider, while the subplan's per-manifest step builds the request and capability for each attempt and the plugin boundary is meant to expose only the data one attempt needs. Severity: 3/10

Existing Risk: 3/10 - A provider that normalizes or annotates its request in place silently changes the query, count, or depth a later fallback provider receives, and the mutable type accepts the change.

Proposal Risk: 1/10 - A provider can still mutate its own request, but the mutation is now confined to that attempt and no bundled provider relies on the shared object.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "give each provider attempt its own request object". In `src/web-search/search.ts`, move the `providerRequest` literal from before `for (const manifest of resolution.manifests)` to inside the loop, after the `deps.signal?.throwIfAborted()` call and next to the capability literal, so each attempt receives a fresh `{ query: request.query, numResults: request.numResults, depth: request.depth }`. `product/plans/complete/web-search-6-search-core.md` directs building the request and capability for each manifest, and the capability is already rebuilt per attempt. Extend `src/web-search/search.test.ts` with a first fake provider that mutates the request it receives (for example sets `numResults` to 1) and a second provider that succeeds; assert the second provider saw the command's original values and the output still renders from the command. The existing request-and-capability shape test and every fallback test must keep passing; no rendering or failure-line behavior changes.
