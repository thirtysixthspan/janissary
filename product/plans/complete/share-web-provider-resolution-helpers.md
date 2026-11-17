# Share the disabled-provider and refusal logic between search and fetch attempt resolution

**Complexity: 5/10** — one new neutral module (~40 added lines) with two helpers and the moved types, three existing resolvers/registry files edited, 5 behavioral requirements and 6 test scenarios (p=5.01).

## Goal

`web search` and `web fetch` resolve provider attempts in two modules that carry the same two rules. `autoAttempts` in `src/web/providers/search-resolution.ts` and `autoFetchAttempts` in `src/web/providers/fetch-resolution.ts` each filter a set of eligible manifests down to the enabled ones, then, if none is enabled, map every eligible manifest to its stored disabled reason (with an `Unknown failure` fallback) and call `formatFailures` with their own `FailureHeadings`. Both explicit resolvers repeat the same "this provider is disabled" branch. `fetch-resolution.ts` additionally imports the `AttemptResolution` and `DisabledReason` types from the search-specific module, so fetch resolution cannot be read without a search module. A future change to how disabled providers are reported has to be made twice, and the two commands can drift apart on the same provider state.

## Approach

Put the two shared rules and their two shared types in a neutral `src/web/providers/resolution.ts`. Both resolvers keep the lines that belong to their own command (unknown provider, no provider configured, not configured, unsupported format) in the order they already use, and delegate only the disabled-provider decisions. `FailureHeadings` is already a parameter of `formatFailures` in `src/web/providers/failure-lines.ts`, so the shared helpers take it explicitly and produce the correct command-specific wording without knowing which command called them.

The types move to the neutral module and keep their existing exported names. `search-resolution.ts`, `fetch-resolution.ts`, and `registry.ts` import them from `resolution.ts` directly. Re-exporting the types from `search-resolution.ts` to spare the existing test suites is not possible: `unicorn/prefer-export-from` demands an `export … from` statement while the direct-import rule's `no-restricted-syntax` forbids exactly that statement under `src/`. So the three existing test suites' type-only import lines move to `resolution.js`; every assertion, fixture, and behavior they pin stays byte-for-byte the same.

This is a pure refactor: no output line, ordering, or observable behavior changes, so the specs already describe the resulting behavior and need no edit.

## Implementation steps

1. Add `src/web/providers/resolution.ts`. It defines and exports `AttemptResolution` (`{ kind: 'attempts'; manifests: WebSearchProviderManifest[] } | { kind: 'line'; line: string }`) and `DisabledReason` (`(id: string) => string | undefined`), moved verbatim from `search-resolution.ts`.
2. In that module, add `resolveEnabledAttempts(eligible, disabledReason, headings)`: filter `eligible` to the manifests whose disabled reason is `undefined`; return them as `{ kind: 'attempts' }` when any remain; otherwise map each eligible manifest to `{ name, reason: disabledReason(id) ?? 'Unknown failure' }` and return `{ kind: 'line', line: formatFailures(failures, headings) }`. This is the body currently duplicated in both `auto` resolvers.
3. In that module, add `resolveDisabledAttempt(manifest, disabledReason, headings)`: return `undefined` when the manifest has no stored reason, otherwise return `{ kind: 'line', line: formatFailures([{ name: manifest.id, reason }], headings) }`. This is the branch duplicated in both explicit resolvers.
4. In `src/web/providers/search-resolution.ts`, replace the two type definitions with a type import from `resolution.ts`, import the two helpers, and have `explicitAttempts` return `resolveDisabledAttempt(...)` when it is defined and `autoAttempts` return `resolveEnabledAttempts(configuredManifests, ...)` after its empty check. Keep the unknown-provider, no-provider-configured, and not-configured lines and their order.
5. In `src/web/providers/fetch-resolution.ts`, import the types and helpers from `resolution.ts` instead of `search-resolution.ts`, and have `explicitFetchAttempts` use `resolveDisabledAttempt(...)` and `autoFetchAttempts` use `resolveEnabledAttempts(eligible, ...)` after its empty check. Keep the unknown-provider, no-provider-configured, not-configured, and unsupported-format lines and their order.
6. Repoint the `AttemptResolution` type import in `src/web/providers/registry.ts` to `resolution.ts`.
7. Run `$janissary/scripts/run.mjs check-diff` after each step.

## Tests

- **`src/web/providers/resolution.test.ts`** (new), mirroring the fake-manifest and `disabledReason` helper style of `search-resolution.test.ts`: `resolveEnabledAttempts` returns the enabled manifests in order and skips disabled ones; returns a single `formatFailures` line when the only eligible manifest is disabled; returns the every-failed block in order when all are disabled; and uses the caller's `FailureHeadings` (assert once with search headings and once with fetch headings). `resolveDisabledAttempt` returns `undefined` for a manifest with no stored reason and the single failure line with the caller's headings for one with a reason.
- `src/web/providers/search-resolution.test.ts`, `src/web/providers/fetch-resolution.test.ts`, and `src/web/providers/registry.test.ts` pin every output line through the two resolvers and still pass with only their type-only import lines repointed to `resolution.js`, proving the refactor preserved behavior.

## Out of scope

- The unknown-provider, not-configured, no-provider-configured, and unsupported-format lines, which stay in their own resolver modules.
- The search/fetch capability filters (`searchesWeb`, `fetchesWeb`, `servesFetchFormat`, `isConfigured`) and the order in which each resolver applies them.
- The registry's activation, guard, and failure-classification behavior.
- The local-or-remote runner duplication in the tab adapters, which is a separate backlog entry.

## Verification

- `$janissary/scripts/run.mjs check-diff` passes.
- `search-resolution.test.ts`, `fetch-resolution.test.ts`, and `registry.test.ts` are green with only their type imports repointed.
- Only `resolution.ts` owns the `formatFailures(... ?? 'Unknown failure')` block.

## Documentation and specification impact

None. The shared disabled-provider rules are pure refactors of how the two resolvers reach the same output; `product/specs/web-search.md` and `product/specs/web-fetch.md` already describe that output, and no help page or user documentation describes the module layout.
