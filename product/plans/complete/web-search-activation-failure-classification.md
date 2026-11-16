# Classify activation failures as plugin failures regardless of error class

**Complexity: 4/10** — ~12 added production lines in one file, 4 requirements, 7 test scenarios, and one new private helper (p=4.35).

## Goal

A provider module whose `activate` rejects must always be treated as a plugin failure and disabled, including when the rejection is a `ProviderRequestError`. A `ProviderRequestError` thrown by `search` must remain an expected failure that never disables. An abort must keep taking precedence over both classifications.

## Issue

Recorded on PR #2010's branch backlog, severity 4/10:

> Make an activation failure that throws `ProviderRequestError` disable the provider like every other import failure.

Verified in `src/web-search/registry.ts`: `runAttempt` sends both the activation rejection and the search rejection through the same `classifyFailure`. That function checks the abort signal, then returns `{ kind: 'failed', reason: error.message }` for any `ProviderRequestError`, and only disables everything else. So an `activate` that rejects with a `ProviderRequestError` never disables or reports the provider and is retried on every later search. That contradicts `./product/plans/complete/web-search-5-provider-registry.md`'s rule that a provider module that fails to import is a plugin failure and is disabled.

`ProviderRequestError` describes an expected answer from a provider's API call. A module that cannot import has not made one, so the expected-failure rule has no meaning on the activation side.

## Approach

1. Give activation its own classification helper in `src/web-search/registry.ts`. It checks `capability.signal?.aborted === true` first and returns `{ kind: 'aborted', error }`; otherwise it disables the manifest with `provider failed: ${errorFirstLine(error)}`, whatever the error class.
2. Keep the existing classification for `search`, renamed to make its scope explicit: abort first, then `ProviderRequestError` as `{ kind: 'failed', reason: error.message }`, then disable.
3. Use the activation helper only in the `loadProvider` catch; leave the `search` catch on the search helper.
4. Add registry tests for an activation rejection that throws `ProviderRequestError`, including the disable, the single report, and a later auto resolution that skips the provider; add an aborted activation rejection case.
5. Update the "Validation and failure" section of `documentation/developer-documentation/web-search-providers.md` so activation failures always disable and the expected-failure rule is scoped to `search`.

## Design decisions

- **Two helpers, not a source flag.** A boolean argument would make each call site read as the same classification with a switch. Two named helpers state which side of the boundary each applies to and keep `runAttempt` unchanged apart from the call name.
- **The abort check stays first.** A cancellation is not a provider failure, and `./product/plans/complete/web-search-5-provider-registry.md` says the abort check runs before every other classification. Both helpers therefore begin with it.
- **The activation reason is the same `provider failed: <first line>` form.** The disabled line, the explicit-provider failure line, and the notification already consume that reason shape. A `ProviderRequestError`'s full message is not used as the reason, because a module that fails to import is a plugin failure, not an expected request answer.
- **`search` classification is unchanged.** A `ProviderRequestError` from `search` still returns `'failed'` with its message and never disables, so `auto` still falls back on a normal API failure.
- **Rename `classifyFailure` to `classifySearchFailure`.** After activation gets its own helper, the unqualified name would imply it covers both. It is private, so the rename has no external effect.
- **No contract or spec change.** `src/web-search/contract.ts` and the behavior spec are not edited: the work item names the registry, its tests, and the provider reference page. The user-visible behavior spec is still deferred to `./product/plans/ready/web-search-10-typed-command.md`.

## Proposed changes

### `src/web-search/registry.ts`

Keep `runAttempt`'s API-version check first. Then:

- Rename the existing `classifyFailure` to `classifySearchFailure` and leave its body as it is: abort, then `ProviderRequestError` as `'failed'`, then `disable`.
- Add `classifyActivationFailure(manifest, error, capability, reportDisabled)` beside it: abort first, then `disable(manifest, \`provider failed: ${errorFirstLine(error)}\`, reportDisabled)` without an error-class check.
- In `runAttempt`, the `loadProvider` catch calls `classifyActivationFailure`; the `provider.search` catch keeps calling `classifySearchFailure`.

The added production code is one private helper of about eight lines and one renamed call site; the file stays well under the 200-line limit.

### `src/web-search/registry.test.ts`

Add a case after "an import failure as a plugin failure with the error first line":

- An `activate` that rejects with `new ProviderRequestError('import failed')` returns `{ kind: 'plugin-failed', reason: 'provider failed: import failed' }`.
- The same attempt calls `reportDisabled` once with `('tavily', 'provider failed: import failed')`.
- With a second configured provider in the registry, a later `resolveAttempts('auto', TOKENS)` lists only `tinyfish`.

Add a case beside the existing abort tests:

- An `activate` that rejects with a `ProviderRequestError` while `capability.signal` is aborted returns `'aborted'` carrying the same error object, calls no `reportDisabled`, and leaves the provider resolvable by name.

### `documentation/developer-documentation/web-search-providers.md`

In "Validation and failure":

- Change the plugin-failure bullet `- \`activate\` rejects or throws.` to say an activation failure always disables, whatever the error type, including a `ProviderRequestError`, because an import failure is never an expected answer from the provider's API.
- Change the opening of the expected-failure paragraph from "An expected failure is a thrown `ProviderRequestError`" to "A `search` that throws a `ProviderRequestError` is an expected failure", so the rule is explicitly scoped to `search`.

No other paragraph changes.

## Tests

`src/web-search/registry.test.ts`, vitest `server` project, no network:

1. Activation rejects with `ProviderRequestError('import failed')` → `plugin-failed` with reason `provider failed: import failed`.
2. The same failure calls `reportDisabled` exactly once with `('tavily', 'provider failed: import failed')`.
3. A later `resolveAttempts('auto', TOKENS)` skips the disabled provider and lists only `tinyfish`.
4. An activation rejection while the signal is aborted → `aborted` with the same error object, no `reportDisabled` call, and the provider still resolvable by name.
5. The existing plain import failure still classifies as `plugin-failed` with `provider failed: Cannot find module`.
6. The existing search `ProviderRequestError` still classifies as `failed` with its message and does not disable.
7. The existing search plain throw still classifies as `plugin-failed` and disables.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- Confirm the registry and compatibility tests still pass unchanged.

## Spec

No `./product/specs/` update. The web search behavior spec does not exist yet and is owned by `./product/plans/ready/web-search-10-typed-command.md`. This fix hardens internal provider-plugin containment before that command surface lands; the developer reference page is the current documentation for the contract.

## Out of scope

- Changing `search` classification, fallback order, or `reportDisabled` behavior.
- Editing `src/web-search/contract.ts`, `src/web-search/search.ts`, or the provider modules.
- Updating `help/` or `documentation/user-documentation/`; neither describes provider failure classification.
- Writing `product/specs/web-search.md` ahead of `./product/plans/ready/web-search-10-typed-command.md`.
- Any change to resolution lines, notification text, or the API version contract.
