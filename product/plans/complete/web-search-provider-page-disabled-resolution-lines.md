# Document the disabled-provider resolution lines in the provider reference page

**Complexity: 1/10** — a docs-only correction with no production lines, files, requirements, scenarios, or new units (p=1.578).

## Goal

`documentation/developer-documentation/web-search-providers.md` must let a provider author predict every line resolution can return. Its "Resolution and ordering" section currently lists the unknown-provider, not-configured, and no-provider lines and presents them as the complete set. It omits the two forms that appear once a provider is disabled: the single `Web search failed (<id>): <reason>.` line for an explicit `--provider` name and for `auto` with one configured provider, and the `Web search: every provider failed.` header with one `- <id>: <reason>` line per provider when `auto` has two or more configured providers and all are disabled. It also never names the formatter that produces them, so the page and the source can drift.

## Issue

Recorded on PR #2010's branch backlog, severity 3/10:

> The page's "Resolution and ordering" section presents the unknown-provider, not-configured, and no-provider lines as the complete set, omitting the explicit disabled-provider line and the auto all-providers-failed form that `resolveAttempts` returns.

Verified against `src/web-search/registry.ts`: `explicitAttempts` returns `formatFailures([{ name: manifest.id, reason }])` for a disabled provider, and `autoAttempts` returns `formatFailures(failures)` over every configured provider once none of them is enabled. `formatFailures` in `src/web-search/failure-lines.ts` prints the single line for one failure and the header plus `- <id>: <reason>` lines for more than one. The registry tests already pin both forms: "disables a provider after a plugin failure and reports it once", "reports every configured provider failure for auto when all are disabled", and "reports one disabled provider as a single failure line for auto".

## Approach

Edit only the "Resolution and ordering" section of the page:

1. Extend the bullet list of resolution lines with two entries:
   - `Web search failed (<id>): <reason>.`, for an explicit `--provider` that names a disabled provider and for `auto` when exactly one configured provider is disabled. `<id>` is the manifest id and `<reason>` is the stored reason from the failure that disabled it.
   - `Web search: every provider failed.` followed by one `- <id>: <reason>` line per provider, in catalog order, when `auto` has two or more configured providers and every one of them is disabled.
2. Say that an explicit name is checked unknown, then disabled, then not configured, so a disabled provider prints its failure line even when its token file is gone. The section already says `auto` skips unconfigured providers before disabled ones; this states the explicit-name order the same way.
3. Add a short paragraph naming `formatFailures` in `src/web-search/failure-lines.ts` as the formatter both disabled-provider forms use, and point readers at `resolveAttempts` in `src/web-search/registry.ts` for the exact conditions.

Then re-read the finished section and compare each quoted line with the source.

## Design decisions

- **List the literal lines rather than describe a rule.** The page already quotes the unknown-provider, not-configured, and no-provider lines verbatim. A provider author troubleshooting a disabled build can search for the text they saw, and the failure-line test pins the same strings.
- **Name both source files.** `formatFailures` is the single formatter behind a disabled provider's line and the search core's all-attempts-failed line, and `resolveAttempts` owns the conditions. Naming them tells a maintainer where a wording change must land, which is what the recorded proposal asks for.
- **Keep `Web search: no provider configured.` distinct from a failure.** It is reserved for `auto` with no configured provider at all. A configured provider that is disabled prints a failure line instead, because the provider exists and the build is broken, not missing.
- **Say the single line covers `auto` with one configured provider.** `formatFailures` keys on the number of failures, not on whether the search was explicit or auto, so the page states both routes to the same line rather than implying the line is explicit-only.
- **No source or test change.** The behavior is implemented and pinned by the existing registry and failure-line tests. The gap is only that the page does not describe it.

## Proposed changes

Only `documentation/developer-documentation/web-search-providers.md` changes. The "Resolution and ordering" list gains:

```markdown
- `Web search failed (<id>): <reason>.`, for an explicit `--provider` naming a disabled provider, and for `auto` when its one configured provider is disabled. `<reason>` is the stored reason from the failure that disabled it.
- `Web search: every provider failed.` followed by one `- <id>: <reason>` line for each provider, in catalog order, when `auto` has two or more configured providers and all of them are disabled.
```

A paragraph after the list names `formatFailures` in `src/web-search/failure-lines.ts` as the shared formatter and `resolveAttempts` in `src/web-search/registry.ts` as the place the exact conditions live. The section's opening paragraph gains the explicit-name check order: unknown, then disabled, then not configured.

No source, test, config, or user-documentation change is needed.

## Tests

No automated test covers page prose, and this fix changes no code. The existing `src/web-search/registry.test.ts` and `src/web-search/failure-lines.test.ts` must keep passing unchanged; between them they already pin every line the page will now document. Verify by reading the finished section against the registry:

- An explicit disabled provider returns one `Web search failed (<id>): <reason>.` line.
- `auto` with one configured provider, disabled, returns that same single line.
- `auto` with two configured providers, both disabled, returns `Web search: every provider failed.` and one `- <id>: <reason>` line each, in catalog order.
- `auto` with no configured provider still returns `Web search: no provider configured.`

## Verification

- `$janissary/scripts/run.mjs check-diff` (docs-only; no source or test change).
- Re-read the page's "Resolution and ordering" section and compare every quoted line with `formatFailures` and the two `resolveAttempts` branches.

## Spec

No `./product/specs/` update. This corrects a developer reference page without changing behavior, and the web search behavior spec is still deferred, as `./product/plans/complete/web-search-provider-page-token-row.md` records.

## Out of scope

- Changing `src/web-search/registry.ts`, `src/web-search/failure-lines.ts`, or their tests.
- The other recorded entries on the branch backlog: the expected-failure fallback and remote-notification lines, and the activation-failure classification.
- Updating `help/` or `documentation/user-documentation/`; neither describes provider resolution.
- Writing a web search behavior spec ahead of `./product/plans/complete/web-search-10-typed-command.md`.
