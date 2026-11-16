<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the truncation note's unconditional wording in the description, plan, spec, and help page, which the delivered first-result budget rule contradicts.

Existing Issue: The description, `product/specs/web-search.md`, `help/web.md`, and the Truncation decision in `product/plans/complete/web-search.md` all say that when results are left out the list ends with the `(showing <k> of <n> results; raise --max-chars for more)` line, while the same paragraphs, and `cutFirstResult` in `src/web-search/render.ts`, drop that line when the first result's link line and the note cannot share `--max-chars`. Severity: 3/10

Existing Risk: 3/10 - A reader trusts the note as unconditional, and the description's own `--max-chars 200` verification example can print no note for a long first-result URL, which reads as a truncation regression rather than the documented boundary.

Proposal Risk: 1/10 - The prose would state the condition once and agree with the code, but the boundary stays easy to miss until someone reads the exception sentence, so a future wording edit could reintroduce the same absolutism.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "make the truncation note's wording conditional in every description". In `product/specs/web-search.md` (Output), `help/web.md` (Output), the Truncation design decision in `product/plans/complete/web-search.md`, and the pull request body's What paragraph, reword the first truncation sentence to say that when results are left out and the first result's link line leaves room for the note, the list ends with the note; keep the existing sentences that state the note is dropped when the two cannot share the budget and that an over-budget link line prints whole. Do not change `src/web-search/render.ts` or its tests: `render.test.ts` already pins the 150-, 147-, and 143-character boundaries and must keep passing untouched. Verify by reading all four paragraphs against `cutFirstResult` and confirming no remaining sentence claims the list always ends with the note; the delivered rendering must not change.


* Correct the description's remote-tab verification claim that results come from the remote's own provider token, which the merged-token rule contradicts.

Existing Issue: The closing "Cannot be exercised in a browser" paragraph of the description says a remote-tab search's "results [are] served by the remote's own `tavily-token`", while `searchWebInTab` sends the near side's merged tokens and `provisionRemoteWorkspace` builds `{ ...own, ...forwarded }`, so with the Setup's local `~/.janissary/tavily-token` the forwarded value wins and the remote's own file is only the fallback. Severity: 3/10

Existing Risk: 3/10 - A reviewer repeating the remote check with the documented setup cannot tell which credential answered and may conclude the remote's own token was used, or that forwarding failed, while the plan's manual check explicitly requires no local token file to demonstrate the remote's own key.

Proposal Risk: 1/10 - The description would state the merged-token rule the help page and remote-server spec already state, but the remote check still needs a remote host and a deliberate choice about whether the local token is present.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "correct the description's remote-token verification note". Rewrite that parenthetical to say the remote search uses the workspace's merged tokens, where a token forwarded from this machine wins over the remote's own `tavily-token` (which is the fallback when no local token file exists), matching `help/web.md`'s Tokens paragraph, `product/specs/remote-server.md`'s version-44 paragraph, and the manual remote check in `product/plans/complete/web-search.md` ("even with no local token file"). Leave every other description paragraph, the title, and all source, test, spec, and help files unchanged. Verify by reading the revised paragraph against `src/web-search/tab-search.ts` (`searchRemote`), `src/remote/serve-provision.ts` (the merged token map), and `src/remote/filesystem/web-search-operation.ts`, and by confirming the sentence no longer claims the remote's own file supplies the results in the documented setup.


* Deliver the registry test inventory the plan promises for disable-and-report and tokenless disabled-provider resolution.

Existing Issue: The canonical plan's `src/web-search/registry.test.ts` bullet says a missing provider export and a non-array result each disable and report once, and that an explicit disabled name prints its stored line even without a token, but the suite asserts only the two failure reasons for the first pair and always passes a token when it checks a disabled name. Severity: 2/10

Existing Risk: 3/10 - A change that turns either non-throwing branch into a plain failure, or that reorders the disabled and not-configured checks in `explicitAttempts`, would pass the suite while changing the user-visible line and the disabled state, because nothing pins those three promises.

Proposal Risk: 1/10 - Three focused cases would pin the promised behavior; the production code is already correct, so this is confined to the registry suite and cannot change runtime behavior.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "add the registry cases the plan promises for disable-and-report and tokenless disabled resolution". In `src/web-search/registry.test.ts`, extend the existing missing-provider and non-array cases with a `reportDisabled` spy and a second manifest: assert `resolveAttempts('auto', TOKENS)` returns only the other provider, the reporter was called once with `provider failed: module has no provider` or `provider failed: search did not return an array`, and the existing reason assertions still hold. Add one case that disables `tavily` through a thrown plugin failure and then asserts `resolveAttempts('tavily', {})` returns `Web search failed (tavily): provider failed: <reason>.` with no token, pinning that `explicitAttempts` checks the disabled map before `isConfigured`. Keep the existing abort cases and every other test untouched, and change no production file. Verify with `$janissary/scripts/run.mjs check-diff`; the new cases must fail if either branch returns a plain failure or if the disabled check moves below the configuration check.
