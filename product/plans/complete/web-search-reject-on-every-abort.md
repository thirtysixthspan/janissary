# Reject a web search on every abort the core can observe

**Complexity: 1/10** — 2 added lines in 1 existing file, 2 requirements, and 2 test scenarios with no new units (p=3.29).

## Goal

`runWebSearch` must reject with the abort whenever `deps.signal` has aborted by the time the call ends, instead of resolving with a resolution line or a failure line. The two uncovered windows are an abort already in effect before the first attempt is resolved, and an abort that lands during or just after the only attempt's failure outcome.

## Issue

Recorded on PR #2010's branch backlog, severity 6/10:

> Close the cancellation gap: make the search core reject on every abort, including one that lands on the final provider failure or before a resolution line is returned.

Verified against `src/web-search/search.ts`:

- `registry.resolveAttempts` runs at line 36 and a `{ kind: 'line' }` resolution is returned at line 37 before any signal check, so a pre-aborted signal with no configured provider returns `Web search: no provider configured.` instead of rejecting.
- The loop's abort check runs at its top, before each attempt. A one-provider search that records a `failed` or `plugin-failed` outcome leaves the loop with no further iteration, and `formatFailures(failures)` at line 64 returns a failure line even when the signal aborted during that attempt.
- `product/plans/complete/web-search-6-search-core.md` states that a search rejects with the abort rather than returning a failure line, and that once the signal aborts, `webSearch` always rejects.

## Approach

1. Add `deps.signal?.throwIfAborted()` at the start of `runWebSearch`, before `registry.resolveAttempts`, so no resolution line can be returned after an abort.
2. Add `deps.signal?.throwIfAborted()` immediately before the final `return formatFailures(failures)`, so the last attempt's non-result outcome cannot resolve with failure lines after an abort.
3. Keep the existing pre-attempt and post-results checks unchanged.

## Design decisions

- **Check before resolution rather than inside the line branch.** One check at the top covers the no-provider, not-configured, unknown-provider, and disabled-provider lines without repeating it in `registry.ts` or branching on `resolution.kind`.
- **Check once after the loop rather than only when failures exist.** The loop exits normally only after at least one failure was recorded; the results path returns and the aborted outcome throws, so one check before `formatFailures` is the final-outcome check.
- **Keep both existing checks.** The pre-attempt check prevents a later fallback attempt from starting, and the post-results check rejects a search whose provider resolved after the signal fired. Removing either would reopen a window this fix is meant to close.
- **The remaining window is unobservable.** An abort that arrives after the final synchronous return cannot affect an awaited caller, so the core rejects on every abort it can see.
- **No behavior change for a non-aborted call.** Resolution lines, fallback, failure lines, and rendering are untouched.

## Proposed changes

Only `src/web-search/search.ts` changes, adding two checks:

```ts
export async function runWebSearch(
  registry: ProviderRegistry,
  request: WebSearchCommand,
  deps: WebSearchDeps,
): Promise<string> {
  deps.signal?.throwIfAborted();
  const resolution = registry.resolveAttempts(request.provider, deps.tokens);
  // unchanged loop...
  deps.signal?.throwIfAborted();
  return formatFailures(failures);
}
```

No new module, function, or type. The file stays well under the 200-line `max-lines` limit.

## Tests

Extend `src/web-search/search.test.ts` with two tests in the existing `describe('runWebSearch')` block:

- **Final failure after an abort** — a single fake `tavily` provider throws a plain `Error('boom.')`, and `reportDisabled` aborts the controller, as the existing between-attempt test does. `runWebSearch` must reject with the abort error, and `reportDisabled` must have been called once with `('tavily', 'provider failed: boom')`. This exercises the final `formatFailures` path, which the existing two-provider test never reaches because its second attempt starts after the between-attempt check rejects.
- **Pre-aborted signal before resolution** — abort the controller before the call and pass `tokens: {}` so the registry would return the no-provider line. `runWebSearch` must reject with the abort error, neither provider's `activate` may run, and `fetch` may not be called.

The existing abort, fallback, failure-line, resolution-line, and rendering tests must keep passing unchanged.

## Verification

- `$janissary/scripts/run.mjs check-diff`
- Confirm the two new tests fail against the current `src/web-search/search.ts` before the source change and pass after it.

## Spec

No `./product/specs/` update. The web search behavior spec does not exist yet on this branch; it is deferred to a later documentation slice, as `./product/plans/complete/web-search-provider-page-token-row.md` records. This fix restores the cancellation behavior that `./product/plans/complete/web-search-6-search-core.md` already specifies.

## Documentation

Update the abort sentence in the "Validation and failure" section of `documentation/developer-documentation/web-search-providers.md` to state that an aborted search rejects with the abort rather than printing a failure or resolution line, including when the abort lands before resolution or on the final provider's failure. No `help/` or user-documentation page describes this behavior.

## Out of scope

- Changing `src/web-search/registry.ts`, the providers, rendering, or failure-line formatting.
- Adding an abort check after the final synchronous return, which no caller can observe.
- Writing the web search behavior spec ahead of its documentation slice.
- The other three recorded entries on the branch backlog.
