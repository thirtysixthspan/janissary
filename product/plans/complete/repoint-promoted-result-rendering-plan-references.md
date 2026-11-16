# Repoint the result-rendering plan's dependents at its complete-folder path

**Complexity: 1/10** — no production lines or files, one requirement, two verification scenarios (p=2.47)

The result-rendering slice was promoted from `product/plans/ready/` to `product/plans/complete/`, but the plans that depend on it were not updated, so their dependency links point at a file that is no longer there. The search core, the provider-tokens, bundled-providers, and provider-registry slices in `ready/`, and the command-grammar slice in `complete/`, all still spell the plan's old `ready/` path.

## Goal

Every reference to the result-rendering plan under `product/` resolves to its current file, `product/plans/complete/web-search-2-result-rendering.md`, so the next agent following a dependency link lands on the contract and rendering decisions instead of rediscovering them. No prose, prose claim, type name, function name, or other path changes.

## Approach

Replace only the stale pre-promotion path with `./product/plans/complete/web-search-2-result-rendering.md` at each occurrence the backlog entry lists. Leave the surrounding sentence, the named types and functions, and every other reference — including the moved plan's own pre-existing reference to `ready/web-search-1-command-grammar.md` — exactly as they are.

The occurrences were verified against the checked-out branch:

| File | Occurrences | Where |
| --- | --- | --- |
| `product/plans/ready/web-search-3-provider-tokens.md` | 1 | the dependency sentence in `## Dependencies` |
| `product/plans/ready/web-search-4-bundled-providers.md` | 3 | the intro paragraph, the dependency bullet, and the out-of-scope bullet |
| `product/plans/ready/web-search-5-provider-registry.md` | 1 | the first dependency bullet |
| `product/plans/ready/web-search-6-search-core.md` | 1 | the rendering dependency bullet |
| `product/plans/complete/web-search-1-command-grammar.md` | 1 | the type-only import clause in "No host dependencies" |

`product/plans/complete/web-search-2-result-rendering.md` itself has no identical stale self-reference, so it needs no edit. The two references in `product/backlog/pull-request.md` disappear when that resolved entry is removed, not by rewriting the entry's text.

## Implementation steps

1. In `product/plans/ready/web-search-3-provider-tokens.md`, repoint the one dependency sentence.
2. In `product/plans/ready/web-search-4-bundled-providers.md`, repoint the intro, the dependency bullet, and the out-of-scope bullet.
3. In `product/plans/ready/web-search-5-provider-registry.md`, repoint the first dependency bullet.
4. In `product/plans/ready/web-search-6-search-core.md`, repoint the rendering dependency bullet.
5. In `product/plans/complete/web-search-1-command-grammar.md`, repoint the type-only import clause.
6. Re-read each edited sentence to confirm it still names the same types and functions, then run `grep -rn "plans/ready/web-search-2" product` and confirm it matches only the backlog entry until that entry is removed in the plan-promotion step. The plan files spell the stale path only as prose descriptions, never as the literal search string, so the check stays clean.

## Tests

None. The change is text inside plan documents; no behavior, type, or executable code changes, so no test can distinguish before from after. Verification is the repository-wide stale-path grep returning no matches after the backlog entry is removed, plus a re-read of every edited sentence, and `$janissary/scripts/run.mjs check-diff` for the documentation-only diff.

## Spec

No functional spec applies: no command, flag, default, message, or user-visible behavior changes. The fix restores documentation links inside the plan graph only.

## Out of scope

- The result-rendering plan's own reference to `ready/web-search-1-command-grammar.md`, which is a separate pre-existing stale link from an earlier promotion.
- Any other stale `ready/` link not naming the result-rendering plan, such as the command-grammar dependency in `product/plans/ready/web-search-6-search-core.md`.
- Adding an automated link check for the plan graph; the backlog's proposal risk notes that none exists, but this fix does not build one.
- Every source, test, spec, help, and user-documentation file.
