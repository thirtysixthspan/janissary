# Correct the provider page's remote disabled-provider claim

**Complexity: 1/10** — a one-sentence docs correction in one page, no production files or behavior (p=2.07).

## Goal

`./documentation/developer-documentation/web-search-providers.md` must state the disabled-provider rule the code actually implements on a remote search: no notification is posted and the output prints only the answering provider, so a provider disabled during a successful fallback is reported nowhere until a later failure line names it.

## Issue

Named when running this task against PR #2010, and recorded nowhere in `./product/backlog/pull-request.md`:

> correct the developer provider reference's remote disabled-provider claim

The paragraph on validation and failure at line 173 still says:

> A search on a remote machine passes no `reportDisabled`, so no notification appears there and the reason reaches the reader only in the failure lines.

That is the claim the previous repair corrected in `./product/specs/web-search.md` and `./help/web.md`. Its plan, `./product/plans/complete/web-search-disabled-provider-fallback-documentation.md`, listed this page as out of scope, so the developer reference kept the old wording.

Verified against the code:

- `src/web-search/search.ts` (`runWebSearch`) returns as soon as an attempt produces results, rendering only that provider's results. The accumulated `failures` array is dropped, so a provider disabled before a later provider succeeds appears in neither the results nor the search output.
- `src/web-search/registry.ts` calls `reportDisabled` at the moment a provider is disabled, before the loop moves on. A fallback success does not undo or retract it.
- `src/web-search/tab-search.ts` supplies `reportDisabled` only for a local search, posting `Web search provider "<name>" disabled: <reason>.` through `notify`. A remote search calls `port.webSearch` and passes no callback.
- `src/remote/filesystem/web-search-operation.ts` runs the far-side search with no `reportDisabled`, and the far side has no notifications tab to post to.

A later failure line names a disabled provider only in two situations: an explicit search of it prints `Web search failed (<name>): <reason>.`, and `auto` prints the disabled providers' lines when every configured provider is already disabled. An `auto` search that still has an enabled provider left filters the disabled ones out of its attempt list.

## Approach

1. In the paragraph at line 173 of `./documentation/developer-documentation/web-search-providers.md`, replace the one sentence about a remote search with the actual rule, keeping every other sentence in the paragraph unchanged: the `reportDisabled` description, the repeat-failure rule, and the restart sentence.
2. Match the wording already used in `./product/specs/web-search.md` and `./help/web.md`, in this page's developer voice.
3. Re-read the edited paragraph against `src/web-search/search.ts`, `src/web-search/registry.ts`, `src/web-search/tab-search.ts`, and `src/remote/filesystem/web-search-operation.ts`.

## Design decisions

- **Say what the output prints, not what it "carries".** The old wording implied the failure reason always reaches the search output. The code returns the first successful provider's rendered results and discards the failure list, so the page must say the output prints only the answering provider.
- **State the remote gap as a gap, and name the later lines.** The far side posts nothing and prints only the winner, so a disable covered by a successful fallback has no report anywhere. The sentence names the two cases that do produce a failure line rather than promising one will arrive.
- **Keep the local rule as it is.** The preceding sentences already describe the local notification correctly; only the remote sentence is wrong. Rewriting the whole paragraph would expand scope without correcting anything.
- **Keep the `reportDisabled` mechanism explicit.** This is the developer reference, so the sentence still says the remote call passes no `reportDisabled`; it adds the output behavior that makes the reason unreported.
- **No source or test change.** The behavior is already pinned by `src/web-search/search.test.ts` and `src/web-search/tab-search.test.ts`. The defect is only that the page describes a different rule.
- **No spec or help change.** `./product/specs/web-search.md` and `./help/web.md` already carry the corrected rule from the previous repair; this page is the one remaining copy of the inaccurate claim.

## Proposed changes

Only `./documentation/developer-documentation/web-search-providers.md` changes. In the paragraph at line 173, the sentence:

```markdown
A search on a remote machine passes no `reportDisabled`, so no notification appears there and the reason reaches the reader only in the failure lines.
```

becomes:

```markdown
A search on a remote machine passes no `reportDisabled`, so no notification appears there, and it prints only the provider that answered, so a provider disabled during a successful fallback is reported nowhere until a later failure line names it: an explicit search of it, or `auto` once every configured provider is disabled.
```

No source, test, config, spec, help, or other documentation change.

## Tests

No automated test covers page prose, and this fix changes no code. The existing tests must keep passing unchanged through `$janissary/scripts/run.mjs check-diff`:

- `src/web-search/search.test.ts` — the fallback case proves the output omits an earlier failure.
- `src/web-search/tab-search.test.ts` — the local notification case proves only the local caller posts one.

Verify the prose by reading it:

- The sentence says a remote search posts no notification.
- The sentence says the remote output prints only the answering provider.
- The sentence says a provider disabled during a successful fallback is reported nowhere, and names the two cases where a later failure line does name it.
- Every other sentence in the paragraph is byte-for-byte unchanged.

## Verification

- `$janissary/scripts/run.mjs check-diff` (docs-only; no source or test change).
- Re-read the edited paragraph beside `src/web-search/search.ts`, `src/web-search/registry.ts`, `src/web-search/tab-search.ts`, and `src/remote/filesystem/web-search-operation.ts`.
- Search the tree for the old phrase to confirm no page still claims the reason reaches the reader in the failure lines.

## Spec

No `./product/specs/` update. `./product/specs/web-search.md` already states the corrected rule in its "Disabled providers" section; this fix only brings the developer reference in line with it.

## Out of scope

- Changing `src/web-search/search.ts`, `src/web-search/tab-search.ts`, `src/web-search/registry.ts`, the remote operation, or the remote port.
- Changing the behavior so a far-side fallback success carries the disabled reason over the wire.
- Rewriting the rest of the paragraph or any other section of the developer page.
- `./product/specs/web-search.md` and `./help/web.md`, already corrected.
- Updating the PR description; the named work item calls for no description change.
- Other backlog entries on the branch.

## Rating basis

lines_added=0, files_edited=0, requirements=1, scenarios=0, new_units=0. Production counts are zero because the only edited file is a documentation page; the single requirement is that the remote sentence states the actual disabled-provider rule. p = 1.578 + 0.705·ln(2) = 2.07, under the 3.461 threshold for 1.
