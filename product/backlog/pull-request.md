<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Stop an aborted web search from disabling and reporting a provider when a broken module resolves without a search function or returns a non-array.

Existing Issue: In `src/web-search/registry.ts`, `runAttempt` checks `capability.signal?.aborted` only inside the thrown-error classifications, so when a provider module resolves without a `search` function or `search` resolves a non-array while the signal is aborted, the provider is still disabled and `reportDisabled` is still called, contrary to the plan's rule that an abort disables and reports nothing. Severity: 3/10

Existing Risk: 3/10 - A cancellation at the wrong moment leaves a provider disabled for the rest of the process and posts a disabled-provider notification for a search the user cancelled, so a later auto search skips a provider that may not deserve it.

Proposal Risk: 1/10 - The abort path no longer disables or reports; a genuinely broken provider still disables on a non-aborted search, as intended.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "keep an aborted search from disabling a provider that resolves oddly". In `src/web-search/registry.ts`, before the `provider === undefined` disable and before the `!Array.isArray(results)` disable, return `{ kind: 'aborted', error: capability.signal.reason }` when `capability.signal?.aborted === true`; leave `classifyActivationFailure`, `classifySearchFailure`, and the synchronous API-version branch unchanged. Add two cases to `src/web-search/registry.test.ts`: an aborted activation that resolves a module without `provider.search`, and an aborted search that resolves a non-array; each must return `kind: 'aborted'`, call no `reportDisabled`, and leave `resolveAttempts` still offering the provider. Keep the existing abort tests and the non-aborted plugin-failure tests passing, and confirm `runWebSearch` in `src/web-search/search.ts` still rethrows the abort before formatting failure lines. Change no docs, spec, or help page; the source edit and its colocated tests are the whole change.
