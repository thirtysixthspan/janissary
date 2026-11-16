# Repoint the provider-page plan's search-core links at the complete-folder path

**Complexity: 1/10** — no production lines or files, one requirement, two verification scenarios (p=2.47).

The search-core slice was promoted from `product/plans/ready/` to `product/plans/complete/`, but one completed plan still spells its former `ready/` path. `product/plans/complete/web-search-provider-page-expected-failure-fallback.md` points at a file that is no longer there in its dependency bullet and again in its final verification sentence.

## Goal

Both references to the search-core plan inside `product/plans/complete/web-search-provider-page-expected-failure-fallback.md` resolve to `./product/plans/complete/web-search-6-search-core.md`, so a reader or agent following the provider-page plan reaches the behavior reference it says to re-read. No prose, prose claim, citation, or other path changes.

## Approach

Replace only the stale pre-promotion path with `./product/plans/complete/web-search-6-search-core.md` at each occurrence inside the provider-page plan. Leave the surrounding sentence, the named outcomes and failure lines, and every other reference exactly as they are.

The occurrences were verified against the checked-out branch:

| File | Occurrences | Where |
| --- | --- | --- |
| `product/plans/complete/web-search-provider-page-expected-failure-fallback.md` | 2 | the search-core bullet in "Issue" and the re-read list in "Approach" |

`product/plans/complete/repoint-promoted-result-rendering-plan-references.md` also spells the same former `ready/` path, but those references describe the earlier result-rendering repoint and what it deliberately left undone. Rewriting them would change that plan's record of the work it performed, so it stays untouched.

The two references in `product/backlog/pull-request.md` disappear when the resolved entry is removed, not by rewriting the entry's text.

## Implementation steps

1. In `product/plans/complete/web-search-provider-page-expected-failure-fallback.md`, repoint the search-core bullet in "Issue".
2. In the same file, repoint the search-core reference in the "Approach" re-read list.
3. Re-grep `product/plans` for the former `ready/` search-core path and confirm the only remaining matches are in `product/plans/complete/repoint-promoted-result-rendering-plan-references.md`.
4. Re-read both edited sentences to confirm they still name the same outcomes, failure lines, and behavior they cited before, then run `$janissary/scripts/run.mjs check-diff`.

## Tests

None. The change is text inside plan documents; no behavior, type, or executable code changes, so no test can distinguish before from after. Verification is the repository-wide grep for the former path, a re-read of both edited sentences, and `$janissary/scripts/run.mjs check-diff` for the documentation-only diff.

## Spec

No functional spec applies: no command, flag, default, message, or user-visible behavior changes. The fix restores documentation links inside the plan graph only.

## Out of scope

- The references in `product/plans/complete/repoint-promoted-result-rendering-plan-references.md`, which record the earlier repoint as it happened.
- Every other stale `ready/` link not naming the search-core plan, such as the remote-operation dependency in the provider-page plan, whose plan is still in `ready/`.
- Adding an automated link check for the plan graph.
- Every source, test, spec, help, and user-documentation file.
