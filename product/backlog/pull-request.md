<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the ACP spec's claim that an agent's web search runs on the host running the loop, which the tab-based routing and the same spec's later paragraph contradict.

Existing Issue: The tool-dispatch paragraph in `product/specs/acp.md` says a `web` line goes to the same search as the typed command "on the host running the loop", while `src/acp/run-prompt.ts` hands the tab label to `searchWebInTab` and `src/web-search/tab-search.ts` sends a local-fallback session on a remote tab through `withRemoteTabPort` to the remote host, and both the plan's design decision and the spec's own Web search section say the search runs on the side that owns the tab. Severity: 4/10

Existing Risk: 4/10 - A reader implementing or troubleshooting a local-fallback session on a remote tab would look for the search on the loop's local host and misdiagnose the remote failure, and the spec contradicts itself.

Proposal Risk: 1/10 - The sentence and the implemented routing agree after the edit; the imprecise pre-existing "host running the loop" shorthand in the file-read dispatch paragraph is outside this entry's scope and unchanged.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "correct the ACP spec's web-search routing sentence". In `product/specs/acp.md`, in the tool-dispatch paragraph that begins "`browser …`, `question …`, and `db sqlite …` commands are caller-side", replace "on the host running the loop" in the sentence "A `web` line likewise goes to the same search as the typed command on the host running the loop" with "on the side that owns the tab", leaving the rest of the sentence and paragraph byte-for-byte. The resulting sentence must agree with the plan's design decision in `product/plans/complete/web-search.md` ("A granted search runs on the side that owns the tab, not on the host running the ACP loop") and with the later Web search section's "searches on the side that owns the tab". Verify against `src/acp/run-prompt.ts` (`runWorkspace` passes the tab label to `searchWebInTab`) and `src/web-search/tab-search.ts` (`localReadRoot` sends a remote tab through `withRemoteTabPort`), and read the repaired paragraph against `product/specs/web-search.md` and `documentation/user-documentation/advanced-agents/acp-agent.md`. Change no code, test, help page, plan, or other spec; run the markdown check-diff after the edit and confirm it exits 0.


* Correct the ask and tell help pages' claim that the agent's web access is only the granted `web search` command, which their own browser grants contradict.

Existing Issue: Both `help/ask.md` and `help/tell.md` say "Its web access is the granted `web search` command", while the same page's default-grant list includes `browser goto` and `browser content`, so the sentence tells a reader that the agent's browser tools are not web access. Severity: 2/10

Existing Risk: 2/10 - A user reading the help page may conclude the granted browser commands cannot reach the web, undermining the grant model the page is explaining.

Proposal Risk: 1/10 - The wording and the grant list agree after the edit; no behavior changes.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "correct the ask and tell help pages' web-access sentence". In `help/ask.md` and `help/tell.md`, change the note's last sentence from "Its web access is the granted `web search` command, which needs a provider token." to "Its web search is the granted `web search` command, which needs a provider token.", leaving the rest of each note byte-for-byte. Verify against the default grants in `src/plugins/roles/roles-file.ts` (`ask` and `tell` both grant `browser goto` and `browser content`, and both grant `web search`) and against `src/plugins/roles/shared.ts`; the agent's browser access is already described in the same page's previous bullet. Change no code, test, spec, plan, or other help page; run the markdown check-diff after the edit and confirm it exits 0.


* Correct the plan's test inventory, which places the cut-to-result-count assertion in the render tests although the cut happens in the search core and its own test covers it.

Existing Issue: The Tests section of `product/plans/complete/web-search.md` says `src/web-search/render.test.ts` covers "cut to `numResults`", but `renderResults` in `src/web-search/render.ts` has no result-count parameter and `render.test.ts` contains no such test; the assertion lives in `src/web-search/search.test.ts` ("dedupes before cutting to numResults"), which the plan's next bullet describes without it. Severity: 2/10

Existing Risk: 2/10 - A reader using the plan's test inventory would look for the cut-to-count coverage in the wrong file and might duplicate the test or assume it is missing.

Proposal Risk: 1/10 - The plan and the test files agree after the edit; no behavior changes.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "correct the plan's test inventory for the result-count cut". In `product/plans/complete/web-search.md`, remove "cut to `numResults`;" from the `src/web-search/render.test.ts` bullet and add "the cut to `numResults` after dedupe" to the `src/web-search/search.test.ts` bullet, leaving the rest of the Tests section and the plan byte-for-byte. Verify that `renderResults` in `src/web-search/render.ts` takes `(results, total, maxChars)` with no result count, that `runWebSearch` in `src/web-search/search.ts` performs `dedupeResults(normalizeResults(results)).slice(0, request.numResults)`, and that `src/web-search/search.test.ts` carries the "dedupes before cutting to numResults" case. Change no code, test, spec, or help page; run the markdown check-diff after the edit and confirm it exits 0.


* Stop an aborted web search from disabling and reporting a provider when a broken module resolves without a search function or returns a non-array.

Existing Issue: In `src/web-search/registry.ts`, `runAttempt` checks `capability.signal?.aborted` only inside the thrown-error classifications, so when a provider module resolves without a `search` function or `search` resolves a non-array while the signal is aborted, the provider is still disabled and `reportDisabled` is still called, contrary to the plan's rule that an abort disables and reports nothing. Severity: 3/10

Existing Risk: 3/10 - A cancellation at the wrong moment leaves a provider disabled for the rest of the process and posts a disabled-provider notification for a search the user cancelled, so a later auto search skips a provider that may not deserve it.

Proposal Risk: 1/10 - The abort path no longer disables or reports; a genuinely broken provider still disables on a non-aborted search, as intended.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "keep an aborted search from disabling a provider that resolves oddly". In `src/web-search/registry.ts`, before the `provider === undefined` disable and before the `!Array.isArray(results)` disable, return `{ kind: 'aborted', error: capability.signal.reason }` when `capability.signal?.aborted === true`; leave `classifyActivationFailure`, `classifySearchFailure`, and the synchronous API-version branch unchanged. Add two cases to `src/web-search/registry.test.ts`: an aborted activation that resolves a module without `provider.search`, and an aborted search that resolves a non-array; each must return `kind: 'aborted'`, call no `reportDisabled`, and leave `resolveAttempts` still offering the provider. Keep the existing abort tests and the non-aborted plugin-failure tests passing, and confirm `runWebSearch` in `src/web-search/search.ts` still rethrows the abort before formatting failure lines. Change no docs, spec, or help page; the source edit and its colocated tests are the whole change.
