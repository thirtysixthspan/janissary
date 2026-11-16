# Pin the registry's disable-and-report branches and its tokenless disabled line

**Complexity: 1/10** — no production code changed, no production files edited, three requirements and three test scenarios (p=3.07).

## Goal

The Tests section of `product/plans/complete/web-search.md` says an import failure, a missing provider export, a non-array result, and a throwing `search` each "disable and report once", and that "an explicit disabled name prints its stored line even without a token". `src/web-search/registry.test.ts` asserts only the returned failure reasons for the missing-provider and non-array branches, and every case that resolves a disabled provider supplies `TOKENS`.

That leaves three promises unpinned. `runAttempt` returns `{ kind: 'plugin-failed', reason }` from both non-throwing branches whether or not `disable` recorded the provider, so a branch that returns the same reason without disabling still passes. The reporter is never asserted on those two branches, so a missing `reportDisabled` call passes too. And `explicitAttempts` checks the disabled map before `isConfigured`, but every disabled-provider assertion passes a token, so moving the disabled check below the configuration check would change the tokenless line to `Web search: provider "tavily" is not configured.` without failing the suite.

This repair adds the missing assertions to the two existing cases and one new tokenless case. `src/web-search/registry.ts` already implements all three promises, so no production file changes.

## Approach

1. **Missing-provider case.** Extend `rejects a module without a search function` in `src/web-search/registry.test.ts`: add a `reportDisabled` spy and a second `tinyfish` manifest, pass the spy to `runAttempt`, keep the existing `{ kind: 'plugin-failed', reason: 'provider failed: module has no provider' }` assertion, and add `expect(reportDisabled).toHaveBeenCalledOnce()`, `expect(reportDisabled).toHaveBeenCalledWith('tavily', 'provider failed: module has no provider')`, and `expect(ids(registry.resolveAttempts('auto', TOKENS))).toEqual(['tinyfish'])`. Rename the case so its title says it disables and reports.

2. **Non-array case.** Do the same for `rejects a search that does not resolve to an array`, keeping its existing `provider failed: search did not return an array` outcome assertion and asserting the reporter once with that reason and `resolveAttempts('auto', TOKENS)` returning only `tinyfish`.

3. **Tokenless disabled case.** Add one case in the style of `disables a provider after a plugin failure and reports it once`: a `tavily` manifest whose `search` throws `tavily boom.`, registered beside a `tinyfish` manifest. Run the attempt with no reporter, then assert `line(registry.resolveAttempts('tavily', {}))` is `Web search failed (tavily): provider failed: tavily boom.`. With no tokens, `isConfigured` is false for `tavily`, so this line can only come from the disabled map.

4. **Leave everything else untouched.** The four abort cases, the all-disabled and single-disabled auto cases, the `ProviderRequestError` cases, the lazy-activation and catalog cases, and the provider catalog block stay byte-for-byte. No production file, spec, `help/`, or user documentation changes.

## Design decisions

1. **Assert the reporter and the map separately.** `disable` both records the reason and calls `reportDisabled` only when the id is new, so one case must observe each: the spy proves the report happened once, and `resolveAttempts('auto', TOKENS)` proves the provider left the attempt list. Asserting only the returned outcome is what leaves both open today.

2. **Use `auto` for the disabled-map assertion.** `autoAttempts` filters the disabled map and would print the single-failure line if every configured provider were disabled. With `tinyfish` still configured, the only passing result is `['tinyfish']`, which fails either if `tavily` was never disabled or if the branch disabled the wrong provider.

3. **Use a thrown search for the tokenless case.** The entry's proposal names a thrown plugin failure, and the existing disable-and-report case already builds that shape. It keeps the new case focused on the resolution order rather than on a third failure classifier.

4. **No production change.** `runAttempt`'s two non-throwing branches already call `disable`, and `explicitAttempts` already reads `disabled` before `isConfigured` (registry.ts lines 106–115). This is a coverage repair, so the fix is confined to the suite.

5. **No spec change.** The behavior spec already describes the disabled-provider line and the disabled state; nothing user-visible changes.

## Implementation steps

1. Extend the missing-provider case in `src/web-search/registry.test.ts` with the spy, the second manifest, and the reporter and `auto` assertions.
2. Run `$janissary/scripts/run.mjs check-diff`.
3. Extend the non-array case the same way.
4. Run `$janissary/scripts/run.mjs check-diff`.
5. Add the tokenless disabled-provider case.
6. Run `$janissary/scripts/run.mjs check-diff` and confirm the whole registry suite passes.
7. Verify the new assertions bite: temporarily return `{ kind: 'failed' }` from the missing-provider branch and confirm the extended case fails; temporarily move the `disabled` check in `explicitAttempts` below the `isConfigured` check and confirm the tokenless case fails; restore `src/web-search/registry.ts` and confirm `git diff` shows no change to it.

## Tests

Three cases in `src/web-search/registry.test.ts`:

- **Missing provider export** — the attempt resolves `{ kind: 'plugin-failed', reason: 'provider failed: module has no provider' }`; `reportDisabled` was called once with that reason; `resolveAttempts('auto', TOKENS)` returns only `tinyfish`.
- **Non-array search result** — the attempt resolves `{ kind: 'plugin-failed', reason: 'provider failed: search did not return an array' }`; `reportDisabled` was called once with that reason; `resolveAttempts('auto', TOKENS)` returns only `tinyfish`.
- **Tokenless disabled provider** — after a thrown search disables `tavily`, `resolveAttempts('tavily', {})` prints `Web search failed (tavily): provider failed: tavily boom.`

Existing coverage that must keep passing untouched: the four abort cases, `disables a provider after a plugin failure and reports it once`, `disables a provider even when no reporter is supplied`, both all-disabled and single-disabled auto cases, the two `ProviderRequestError` cases, the API-version and import-failure cases, and the catalog block.

## Out of scope

- Any change to `src/web-search/registry.ts` or another production file.
- The two abort cases for the same branches, which already assert `reportDisabled` was not called and that the provider stays listed.
- Specs, `help/` pages, and user documentation — the fix changes no behavior.
- Correcting any other Tests bullet in `product/plans/complete/web-search.md`.
- Resolving any other entry in `product/backlog/pull-request.md`.
