# Correct the remote-server spec's provider-failure reporting claim

**Complexity: 1/10** — no production code changes, no production files edited, no test scenarios; two facets of one spec claim (p=2.35).

## Goal

The version-44 paragraph of `product/specs/remote-server.md` says that a provider failure on the far side "is reported only in the failure lines." That is true only for a search that ends in failure. A remote search that falls back to a later provider prints only the winning provider's results and posts no notification anywhere, so a provider that failed before a later one succeeded leaves no report at all. A reader implementing or troubleshooting the far-side operation would look for a failure line that never appears and mistake a silent provider failure for a healthy search.

## Approach

Rewrite the final sentence of the version-44 paragraph so it distinguishes the two outcomes:

- A search that ends in failure answers with the single-failure line `Web search failed (<name>): <reason>.` or the every-provider-failed lines, as formatted by `formatFailures`.
- A provider that fails before a later provider succeeds leaves no failure line and no notification, because the far side supplies no disabled-provider reporter; the output prints only the provider that answered, so that failure is reported nowhere.

The paragraph's earlier sentences — the argument shape (`query`, `numResults`, `maxChars`, `depth`, `provider`), the merged-token rule, and the long-running deadline — stay untouched.

## Verification trail

The claim is checked against these call sites and documents:

- `src/web-search/search.ts` — `runWebSearch` returns `renderSearch` output on the first provider that answers and reaches `formatFailures(failures)` only after every attempt failed. `formatFailures` prints the one-line form for a single failure and the `Web search: every provider failed.` block for several.
- `src/remote/filesystem/web-search-operation.ts` — `run` calls `webSearch(args, { tokens: context.tokens, fetch })` with no `reportDisabled`.
- `src/remote/serve-acp-loop.ts` — `searchWorkspaceCommand` calls `webSearch(parsed, { tokens, fetch: globalThis.fetch, signal })` with no `reportDisabled`.
- `src/web-search/tab-search.ts` — only the local branch passes `reportDisabled`; the remote branch returns the port's text.
- `product/specs/web-search.md` (Disabled providers) and `help/web.md` (Providers) — both already state that a remote search posts no notification and prints only the answering provider, so a provider disabled before a successful fallback is reported nowhere.

## Design decisions

1. **State both outcomes, not only the failure one.** The paragraph's job is to describe the far-side operation's observable result: one failure line, the every-provider-failed block, or none. Naming the silent success-after-failure case is what removes the ambiguity.

2. **Name the user-visible lines rather than the formatter.** The version-44 paragraph already quotes wire argument names and output shapes; quoting the two failure forms keeps it exact without turning a spec into implementation notes.

3. **No change to `product/specs/web-search.md` or `help/web.md`.** Both already describe the remote silence precisely, including the two cases where a disabled provider's stored reason later surfaces. Only the remote-server spec carries the stale shorthand.

## Implementation steps

1. Verify the two outcomes in `src/web-search/search.ts`, `src/web-search/failure-lines.ts`, and the two reporter-less far-side calls.
2. Replace the final sentence of the version-44 paragraph in `product/specs/remote-server.md` with wording that names the failure-ending forms and the silent successful-fallback case.
3. Confirm the paragraph's argument-shape, merged-token, and long-running-deadline sentences are byte-for-byte unchanged.
4. Run `$janissary/scripts/run.mjs check-diff`.
5. Promote this plan to `product/plans/complete/` and remove the resolved entry from `product/backlog/pull-request.md`.

## Tests

No automated tests. The change is prose in a functional spec with no behavior or code surface. `$janissary/scripts/run.mjs check-diff` must still exit 0 for the changed markdown.

Manual verification: read the corrected sentence against `formatFailures` and the two reporter-less far-side calls, and compare it with the Disabled providers section of `product/specs/web-search.md` and the Providers section of `help/web.md`.

## Out of scope

- Any change to `src/`, tests, `help/`, or `documentation/` — they already describe or implement the behavior correctly.
- The version-44 paragraph's argument-shape and long-running-deadline sentences.
- Other entries in `product/backlog/pull-request.md`.
- The pull request title or description.
