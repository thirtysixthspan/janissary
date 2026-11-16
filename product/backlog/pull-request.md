<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request


* Deliver the plan's missing sandbox-spec documentation for the two new search token rows.

Existing Issue: The environment section of `product/specs/sandbox.md` accounts for what a workspaced spawn receives credential by credential — GitHub, Claude, OpenCode, Kilo, and Gemini — but after `PROJECT_TOKENS` gained the `tavily` and `tinyfish` rows it names neither `TAVILY_API_KEY` nor `TINYFISH_API_KEY`, and its scrub paragraph still explains only the LLM provider keys as deliberately unmatched, so the two new variables' presence and survival are undocumented. Severity: 4/10

Existing Risk: 3/10 - A reader auditing what a workspaced process can see from the spec concludes the search keys are not injected or are scrubbed, and a later change can widen or narrow that exposure without the spec noticing.

Proposal Risk: 1/10 - The spec will match the token table and the scrub list, but the user decision to give the keys to every process the table reaches remains and is now documented rather than implicit.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "complete the sandbox spec's credential inventory for the two new search tokens". In `product/specs/sandbox.md`, in the environment section that narrates each injected credential (the paragraph that ends with the Gemini key's two variables, just before the git-identity sentence), add a short paragraph stating that `.janissary/tavily-token` and `.janissary/tinyfish-token` are read by `loadProjectTokens` in `src/project/tokens.ts` and set as `TAVILY_API_KEY` and `TINYFISH_API_KEY` for every workspaced spawn on the confined and pass-through paths alike, with the project's `.janissary/` consulted before `~/.janissary/`, and that the search runs in the Janissary process rather than the spawned one. In the "Environment scrubbing" paragraph, add that neither variable is matched by `ENV_SCRUB_PATTERNS` in `src/sandbox/paths.ts`, so an ambient value survives and a configured token file takes precedence in `workspaceCredentialEnv`, without claiming the list deliberately exempts them. Do not change `src/sandbox/paths.ts` or the injection code. The behavior is already covered by the table-driven cases in `src/project/tokens.test.ts` and `src/sandbox/environment.test.ts`, and by the workspaced-spawn case in `src/sandbox/index.test.ts`; they must keep passing untouched, and the new spec text should be checked against all seven rows of `PROJECT_TOKENS` so a future row makes the spec visibly incomplete rather than silently so.


* Refresh the stale all-five-tokens harness spawn test so its name and coverage match the seven-row token table.

Existing Issue: `src/sandbox/harness-spawn.test.ts` still has `it('injects every credential when all five tokens are given', ...)` with a fixture of the five rows that existed before this commit, so its name now overstates its coverage and the confined harness-spawn path is never exercised for `TAVILY_API_KEY` or `TINYFISH_API_KEY`. Severity: 3/10

Existing Risk: 3/10 - A regression that stops either new key reaching a confined harness spawn passes this suite, while the test's name tells a reviewer the path is covered.

Proposal Risk: 1/10 - The case will cover all seven rows; a hand-built fixture can drift again when an eighth row lands, but the table-driven case in `src/sandbox/environment.test.ts` remains the durable guard for the mapping.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "refresh the all-five-tokens harness spawn test for the two new search rows". In `src/sandbox/harness-spawn.test.ts`, extend the `tokens` fixture in the "injects every credential when all five tokens are given" case with `tavily: 'tvly_live_key'` and `tinyfish: 'tinyfish_live_key'`, assert `result.env.TAVILY_API_KEY` and `result.env.TINYFISH_API_KEY`, and rename the case so it no longer claims five (for example "injects every configured credential"). Leave the per-credential and ambient-value cases above it unchanged; they already cover the fallback and precedence rules. Verify by running the sandbox tests through the repository's normal check and by reading the case against `PROJECT_TOKENS` in `src/project/tokens.ts` so the claim and the table agree. The table-driven cases in `src/project/tokens.test.ts` and `src/sandbox/environment.test.ts` must keep passing untouched.
