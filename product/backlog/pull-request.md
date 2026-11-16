<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request


* Refresh the stale all-five-tokens harness spawn test so its name and coverage match the seven-row token table.

Existing Issue: `src/sandbox/harness-spawn.test.ts` still has `it('injects every credential when all five tokens are given', ...)` with a fixture of the five rows that existed before this commit, so its name now overstates its coverage and the confined harness-spawn path is never exercised for `TAVILY_API_KEY` or `TINYFISH_API_KEY`. Severity: 3/10

Existing Risk: 3/10 - A regression that stops either new key reaching a confined harness spawn passes this suite, while the test's name tells a reviewer the path is covered.

Proposal Risk: 1/10 - The case will cover all seven rows; a hand-built fixture can drift again when an eighth row lands, but the table-driven case in `src/sandbox/environment.test.ts` remains the durable guard for the mapping.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "refresh the all-five-tokens harness spawn test for the two new search rows". In `src/sandbox/harness-spawn.test.ts`, extend the `tokens` fixture in the "injects every credential when all five tokens are given" case with `tavily: 'tvly_live_key'` and `tinyfish: 'tinyfish_live_key'`, assert `result.env.TAVILY_API_KEY` and `result.env.TINYFISH_API_KEY`, and rename the case so it no longer claims five (for example "injects every configured credential"). Leave the per-credential and ambient-value cases above it unchanged; they already cover the fallback and precedence rules. Verify by running the sandbox tests through the repository's normal check and by reading the case against `PROJECT_TOKENS` in `src/project/tokens.ts` so the claim and the table agree. The table-driven cases in `src/project/tokens.test.ts` and `src/sandbox/environment.test.ts` must keep passing untouched.
