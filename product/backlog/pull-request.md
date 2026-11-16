<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Make an activation failure that throws `ProviderRequestError` disable the provider like every other import failure.

Existing Issue: `runAttempt` sends both activation and search rejections through `classifyFailure`, so an `activate` that rejects with a `ProviderRequestError` is treated as an expected search failure, never disables or reports the provider, and is retried on every later search, contrary to the plan's rule that a provider module that fails to import is a plugin failure and is disabled. Severity: 4/10

Existing Risk: 4/10 - A broken provider module can fail on every search without ever being contained or reported, so one bad import keeps costing every auto search and the host never surfaces the failure the plan promises.

Proposal Risk: 2/10 - Activation failures become contained, but the exception is narrow: a provider module that deliberately throws `ProviderRequestError` at import is rare, so the hazard is low-probability even though its consequence is repeated failure.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "classify activation rejections as plugin failures even when they throw ProviderRequestError". In `src/web-search/registry.ts`, keep the abort check first, then give activation its own classification path: when `loadProvider` rejects and `capability.signal` is not aborted, return a `plugin-failed` outcome through `disable` whose reason is `provider failed: <first line of the error>`, regardless of the error class. Keep `search` rejections on the current `ProviderRequestError` expected-failure path. Add a case to `src/web-search/registry.test.ts` where `activate` rejects with `new ProviderRequestError('import failed')`, asserting the outcome is `plugin-failed`, `reportDisabled` is called once with the formatted reason, and a later auto resolution skips the provider; also assert an aborted activation rejection remains `aborted`. Update the "Validation and failure" bullet in `documentation/developer-documentation/web-search-providers.md` to say activation failures always disable and the expected-failure rule applies to `search`. Verify with `$janissary/scripts/run.mjs check-diff`; the existing registry and compatibility tests must keep passing.
