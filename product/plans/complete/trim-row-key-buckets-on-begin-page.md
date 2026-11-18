# Trim row-key buckets when a page begins

**Complexity: 1/10** — one production line added in one file, two behavioral requirements and three test scenarios, no new units or modules (p=3.31).

## Goal

Keep the store of writable row identities bounded even when a page yields no keys, so paging repeatedly through empty or keyless results cannot grow memory without eviction. The eight-page validity window for a write identity and the refusal of older identities stay exactly as they are.

## Approach

`RowKeyStore` in `src/database/row-keys.ts` holds one bucket per page in `pages` and one identity per minted row in `targets`. `RESOLVED_PAGES` is 8. Today `beginPage()` only pushes a new, empty bucket; `trim()` — which shifts buckets past the bound and deletes their keys from `targets` — is called only by `mint()`. `runGrid` in `src/database/grid.ts` calls `beginPage()` once for every page, including a page whose query returns no rows, so a long run of empty pages pushes buckets that nothing ever trims and leaves their older keys resolvable indefinitely.

Call `trim()` at the end of `beginPage()` as well. The bucket array and the targets map are then trimmed on every page boundary whether or not the page minted any key, which is what the comment above `RESOLVED_PAGES` claims. `mint()` keeps its own `trim()` call: a mint can happen without a `beginPage()` first, and the two calls are harmless together because `trim()` is idempotent when the array is within the bound. `runGrid` needs no change — it keeps calling `beginPage()` for every page, empty ones included.

The existing comment on `beginPage()` stays accurate and is left as is; no new comment is needed for a one-line bound call.

## Implementation steps

1. In `src/database/row-keys.ts`, call `this.trim()` at the end of `beginPage()`, after the new bucket is pushed.
2. Leave `mint()`, `resolve()`, `trim()`, and `RESOLVED_PAGES` unchanged, and leave `src/database/grid.ts` unchanged.
3. Add the test described below to `src/database/write.test.ts`.
4. Run `$janissary/scripts/run.mjs check-diff` after each step.

## Tests

In `src/database/write.test.ts`, in the `RowKeyStore` describe block:

- New case: mint a key on one page, then begin `RESOLVED_PAGES` more pages with no mint in between, and assert that the original key no longer resolves — proving the earlier bucket was trimmed on a `beginPage()` call, before any later mint.
- Existing `releases a superseded page and refuses its keys` case keeps passing: pages that mint keys still evict the oldest page and a write naming its key is still refused.
- Existing `still resolves the newest page after several earlier ones` case keeps passing: a key from a recent page still resolves within the window.

## Spec

`product/specs/sql-database.md`: clarify in the write-identity paragraph that the eight-page window counts every page read, including a page with no rows, so an identity from an older page is released even when the pages in between were empty.

## Docs

`documentation/user-documentation/tab-types/sql-browser.md`: clarify in the row-validity sentence that empty pages count toward the eight pages, matching the behavior described in the spec.

## Out of scope

- Changing `RESOLVED_PAGES`, the refusal message, or how a write resolves a key.
- Changing `runGrid` or any call site of `beginPage()`.
- Adding a way to inspect the private `pages` or `targets` collections; the test observes the bound through `resolve()`.
- Any change to command behavior, the wire contract, or the database write path beyond identity expiry.
