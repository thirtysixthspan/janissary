<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's disabled-provider resolution lines in the provider reference page.

Existing Issue: The page's "Resolution and ordering" section presents the unknown-provider, not-configured, and no-provider lines as the complete set, omitting the explicit disabled-provider line and the auto all-providers-failed form that `resolveAttempts` returns. Severity: 3/10

Existing Risk: 3/10 - A provider author or later maintainer cannot predict what the host prints after a provider is disabled, so troubleshooting and documentation of the disabled state stay incomplete.

Proposal Risk: 2/10 - The page would list the missing lines, but it still duplicates their wording instead of generating it from `formatFailures`, so a future wording change can drift.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "document the disabled-provider resolution lines in the provider reference page". In `documentation/developer-documentation/web-search-providers.md`, extend the "Resolution and ordering" list with `Web search failed (<id>): <reason>.` for an explicit disabled provider and for auto with one configured provider, and with `Web search: every provider failed.` followed by one `- <id>: <reason>` line each when auto has two or more configured providers and all are disabled. Name `formatFailures` in `src/web-search/failure-lines.ts` as the shared formatter and point readers to the registry's `resolveAttempts` in `src/web-search/registry.ts` for the exact conditions. No source or test change is expected; the registry tests in `src/web-search/registry.test.ts` already pin the lines, so keep them passing and re-read the page after editing.


* Deliver the plan's expected-failure fallback and remote-notification behavior in the provider reference page.

Existing Issue: The page says an expected `ProviderRequestError` never disables but never says an auto search falls back to the next configured provider, and it says one notification appears without noting that a remote search passes no `reportDisabled` and shows the reason only in failure lines. Severity: 3/10

Existing Risk: 3/10 - A provider author may treat an expected failure as terminal, and a reader may expect a notification on a remote machine where the far side has no notifications tab.

Proposal Risk: 2/10 - The page would match the plan, but the behavior remains split between the registry and the search core, so the documentation must stay aligned with both.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "document expected-failure fallback and the remote notification exception in the provider reference page". In `documentation/developer-documentation/web-search-providers.md`, add to "Validation and failure" that an expected `ProviderRequestError` is recorded and an auto search moves to the next configured provider, that an explicit provider prints the single `Web search failed (<id>): <reason>.` line, and that an abort stops the search without falling back. Qualify the notification sentence to a local search that supplies `reportDisabled`, and add the plan's remote rule: no `reportDisabled` is passed on a remote machine, so the reason appears only in the failure lines. No source or test change is expected; the registry tests in `src/web-search/registry.test.ts` pin the classification, so keep them passing and re-read the page after editing.


* Make an activation failure that throws `ProviderRequestError` disable the provider like every other import failure.

Existing Issue: `runAttempt` sends both activation and search rejections through `classifyFailure`, so an `activate` that rejects with a `ProviderRequestError` is treated as an expected search failure, never disables or reports the provider, and is retried on every later search, contrary to the plan's rule that a provider module that fails to import is a plugin failure and is disabled. Severity: 4/10

Existing Risk: 4/10 - A broken provider module can fail on every search without ever being contained or reported, so one bad import keeps costing every auto search and the host never surfaces the failure the plan promises.

Proposal Risk: 2/10 - Activation failures become contained, but the exception is narrow: a provider module that deliberately throws `ProviderRequestError` at import is rare, so the hazard is low-probability even though its consequence is repeated failure.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "classify activation rejections as plugin failures even when they throw ProviderRequestError". In `src/web-search/registry.ts`, keep the abort check first, then give activation its own classification path: when `loadProvider` rejects and `capability.signal` is not aborted, return a `plugin-failed` outcome through `disable` whose reason is `provider failed: <first line of the error>`, regardless of the error class. Keep `search` rejections on the current `ProviderRequestError` expected-failure path. Add a case to `src/web-search/registry.test.ts` where `activate` rejects with `new ProviderRequestError('import failed')`, asserting the outcome is `plugin-failed`, `reportDisabled` is called once with the formatted reason, and a later auto resolution skips the provider; also assert an aborted activation rejection remains `aborted`. Update the "Validation and failure" bullet in `documentation/developer-documentation/web-search-providers.md` to say activation failures always disable and the expected-failure rule applies to `search`. Verify with `$janissary/scripts/run.mjs check-diff`; the existing registry and compatibility tests must keep passing.
