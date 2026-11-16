<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the registry test inventory the plan promises for disable-and-report and tokenless disabled-provider resolution.

Existing Issue: The canonical plan's `src/web-search/registry.test.ts` bullet says a missing provider export and a non-array result each disable and report once, and that an explicit disabled name prints its stored line even without a token, but the suite asserts only the two failure reasons for the first pair and always passes a token when it checks a disabled name. Severity: 2/10

Existing Risk: 3/10 - A change that turns either non-throwing branch into a plain failure, or that reorders the disabled and not-configured checks in `explicitAttempts`, would pass the suite while changing the user-visible line and the disabled state, because nothing pins those three promises.

Proposal Risk: 1/10 - Three focused cases would pin the promised behavior; the production code is already correct, so this is confined to the registry suite and cannot change runtime behavior.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "add the registry cases the plan promises for disable-and-report and tokenless disabled resolution". In `src/web-search/registry.test.ts`, extend the existing missing-provider and non-array cases with a `reportDisabled` spy and a second manifest: assert `resolveAttempts('auto', TOKENS)` returns only the other provider, the reporter was called once with `provider failed: module has no provider` or `provider failed: search did not return an array`, and the existing reason assertions still hold. Add one case that disables `tavily` through a thrown plugin failure and then asserts `resolveAttempts('tavily', {})` returns `Web search failed (tavily): provider failed: <reason>.` with no token, pinning that `explicitAttempts` checks the disabled map before `isConfigured`. Keep the existing abort cases and every other test untouched, and change no production file. Verify with `$janissary/scripts/run.mjs check-diff`; the new cases must fail if either branch returns a plain failure or if the disabled check moves below the configuration check.
