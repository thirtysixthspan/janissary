# Keep an aborted search from disabling a provider that resolves oddly

**Complexity: 3/10** — ~6 added lines in one production file, three requirements and two test scenarios, no new units (p=3.68).

## Goal

An aborted web search must not disable a provider or call `reportDisabled`, including when the provider module resolves without a `search` function or when `search` resolves a non-array. In `src/web-search/registry.ts`, `runAttempt` currently consults `capability.signal?.aborted` only inside the thrown-error classifications (`classifyActivationFailure` and `classifySearchFailure`). The two non-throwing failure branches — the missing-provider branch and the non-array-result branch — disable the provider and report it even when the signal is already aborted, contradicting the rule already recorded in `product/specs/web-search.md`: an abort is rethrown unchanged and nothing is disabled or reported.

After the fix, both branches return `{ kind: 'aborted', error: capability.signal.reason }` when the signal is aborted, so `runWebSearch` in `src/web-search/search.ts` rethrows that reason at its existing `outcome.kind === 'aborted'` check before any failure line is formatted. A provider that is genuinely broken on a non-aborted search still disables and reports exactly as before.

## Approach

1. **`src/web-search/registry.ts` — missing-provider branch.** In `runAttempt`, after `loadProvider` resolves and before the `provider === undefined` disable, check `capability.signal?.aborted === true` and return `{ kind: 'aborted', error: capability.signal.reason }`. TypeScript narrows `capability.signal` to non-nullish inside the true branch of `signal?.aborted === true`, so no extra optional chaining is needed on `.reason`.

2. **`src/web-search/registry.ts` — non-array-result branch.** Inside the `try`, after `provider.search` resolves and before the `!Array.isArray(results)` disable, apply the same guard and return the same aborted outcome.

3. **Leave untouched:** `loadProvider`, `classifyActivationFailure`, `classifySearchFailure`, the synchronous API-version branch, `disable`, and every resolution function. The guard belongs only where a resolved value would otherwise reach `disable`.

4. **`src/web-search/registry.test.ts` — two new cases.** Mirror the existing abort tests: an `AbortController` pre-aborted with a custom `Error`; assert `outcome.kind === 'aborted'`, `abortedError(outcome)` is that exact error, `reportDisabled` was never called, and `ids(registry.resolveAttempts('tavily', TOKENS))` still lists the provider. The first builds a manifest whose activation resolves `{ provider: { search: undefined as never } }`; the second builds a module whose `search` resolves `'not an array'`.

5. **Existing behavior preserved.** The non-aborted plugin-failure tests (`rejects a module without a search function`, `rejects a search that does not resolve to an array`, the disable-and-report tests) and the three existing abort tests stay unchanged and must keep passing.

## Design decisions

1. **Use `capability.signal.reason`, not the synthetic failure.** The abort path's contract is to rethrow the caller's original abort reason. A missing provider function or a non-array result produced no error object of its own, so the signal's reason is the only faithful error to carry. A pre-aborted controller with no explicit reason yields the standard `AbortError` `DOMException`, which is still a genuine abort value.

2. **Two inline guards over a shared helper.** The file already states the abort check inline in each classification function; matching that shape keeps the diff to two lines and adds no new unit. `registry.ts` is 173 lines, so the addition stays well under the 200-line limit.

3. **No spec change.** `product/specs/web-search.md` already states that "the abort check runs before every classification: when the capability's signal is aborted, the original rejection is rethrown unchanged and nothing is disabled or reported." The implementation is what diverges; the spec already describes the corrected behavior. No `help/` page or user documentation describes this internal boundary, so none changes.

## Implementation steps

1. Edit `src/web-search/registry.ts`: add the abort guard before the `provider === undefined` disable.
2. Run `$janissary/scripts/run.mjs check-diff`.
3. Edit `src/web-search/registry.ts`: add the abort guard before the `!Array.isArray(results)` disable.
4. Run `$janissary/scripts/run.mjs check-diff`.
5. Add the two cases to `src/web-search/registry.test.ts`.
6. Run `$janissary/scripts/run.mjs check-diff` and confirm the existing abort and plugin-failure tests still pass.
7. Re-read `runWebSearch` in `src/web-search/search.ts` and confirm `if (outcome.kind === 'aborted') throw outcome.error` still precedes the failure accumulation and `formatFailures`; no edit there.

## Tests

Two new cases in `src/web-search/registry.test.ts`:

- **Aborted activation resolving a module without `provider.search`** — pre-aborted signal; activation resolves a module lacking `search`; outcome is `kind: 'aborted'` with the signal's reason; `reportDisabled` was not called; `resolveAttempts('tavily', TOKENS)` still offers `tavily`.
- **Aborted search resolving a non-array** — pre-aborted signal; `search` resolves `'not an array'`; outcome is `kind: 'aborted'` with the signal's reason; `reportDisabled` was not called; `resolveAttempts('tavily', TOKENS)` still offers `tavily`.

Existing coverage that must keep passing: `treats a ProviderRequestError rejection during an abort as an abort`, `treats a plain rejection during an abort as an abort`, `treats a ProviderRequestError from activate during an abort as an abort`, `rejects a module without a search function`, `rejects a search that does not resolve to an array`, and the disable-and-report cases.

## Out of scope

- The synchronous API-version mismatch branch, which stays a disable-then-report path exactly as it is today.
- `classifyActivationFailure`, `classifySearchFailure`, `loadProvider`, and the registry's resolution functions.
- `src/web-search/search.ts`, whose abort rethrow already precedes failure formatting.
- Specs, help pages, and user documentation — the spec already describes this behavior.
- Other providers, the ACP wiring, remote search, and the remaining pull-request backlog.
