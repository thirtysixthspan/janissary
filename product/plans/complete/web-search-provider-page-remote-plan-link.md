# Repoint the completed provider-page plan at the promoted remote-operation subplan

**Complexity: 1/10** — a two-line path correction inside one completed plan, no production files or behavior (p=2.07).

## Goal

`./product/plans/complete/web-search-provider-page-expected-failure-fallback.md` must reach the far-side `reportDisabled` rule through a path that exists. It points twice at the subplan's former `product/plans/ready/` location, and that file now lives at `./product/plans/complete/web-search-7-remote-operation.md`.

## Issue

Recorded on PR #2010's branch backlog, severity 2/10:

> Correct the commit's claim that every plan cross-reference to the promoted subplan was repointed, because one completed plan still links twice to its former location.

`124655dd feat(web-search): add the remote web-search operation` promotes the subplan and says it "repoints plan cross-references". Two links in this plan were missed, at line 20 (the `## Issue` dependency bullet that groups `web-search-5-provider-registry.md` with the remote-operation plan) and line 31 (the closing re-read sentence, beside `src/web-search/registry.ts` and `web-search-6-search-core.md`). Both still use the pending folder for a file that has moved, and that path no longer exists on the branch.

A reader following either link to learn the `reportDisabled` rule lands on a missing file and has to guess the new location, so the constraint that prompted the link — that the far-side remote operation passes no callback, and the reason therefore appears only in failure lines — can be dropped from the work it was meant to inform.

## Approach

1. In the `## Issue` dependency bullet, replace the pending-folder path with `./product/plans/complete/web-search-7-remote-operation.md`.
2. In the closing verification paragraph, replace the same pending-folder path with the same `complete/` path.
3. Leave the surrounding prose, the grouping, and every claim untouched.
4. Verify with a repository-wide search that nothing in the tree places the subplan under the pending folder, and that every surviving `web-search-7-remote-operation` reference resolves under `product/plans/complete/`.

## Design decisions

- **Repoint to `complete/`, do not restore `ready/`.** The subplan is implemented and its status folder is the record of that; recreating a copy under the pending folder would both duplicate the plan and misstate its state.
- **Change the path only, not the sentence.** Both places need the same file at a new location, not a new argument. The `reportDisabled`, far-side failure-line, and completed-search-core claims were re-checked against `src/web-search/registry.ts` and `./product/plans/complete/web-search-6-search-core.md` and are accurate, so rewriting them would add risk without adding value.
- **Verify by repository-wide search, not by re-reading the edited file.** The failure was a missed inbound link during a promotion, so the check that would have caught it is a search for every reference to the promoted subplan across the whole tree. Re-reading only the edited plan cannot show that the other plans were already correct.
- **Keep the fix plan itself free of the stale literal.** A plan that quoted the old path verbatim would make the search that proves the fix keep matching, so this plan names the pending folder and the subplan separately.
- **No new subplan for the search.** This is the correction the completed plan itself needs, and adding a file per link would be the kind of reference churn the fix exists to reduce.

## Proposed changes

Only `./product/plans/complete/web-search-provider-page-expected-failure-fallback.md` changes:

- **`## Issue` dependency bullet (line 20)** — the grouped dependency list becomes `./product/plans/complete/web-search-5-provider-registry.md` and `./product/plans/complete/web-search-7-remote-operation.md`.
- **Closing verification paragraph (line 31)** — the re-read comparison names `src/web-search/registry.ts`, `./product/plans/complete/web-search-6-search-core.md`, and `./product/plans/complete/web-search-7-remote-operation.md`.

No source, test, or config change. No other plan changes.

## Tests

No automated test covers plan prose, and this fix changes no code. The existing `src/web-search/registry.test.ts` must keep passing unchanged through `$janissary/scripts/run.mjs check-diff`.

Verify the references by search:

- Nothing in the tree places the subplan under the pending folder any longer.
- Every `web-search-7-remote-operation` reference resolves under `product/plans/complete/`.
- `./product/plans/complete/web-search-7-remote-operation.md` exists on the branch.

## Verification

- `$janissary/scripts/run.mjs check-diff` (plan-only; no source or test change).
- Repository-wide search for the pending-folder form and for every remaining reference to the subplan.
- Re-read the two edited lines and confirm each path's file exists.

## Spec

No `./product/specs/` update. This repairs an internal plan link; it changes no user-visible behavior, and the web search behavior spec is still deferred to `./product/plans/complete/web-search-10-typed-command.md`.

## Out of scope

- Rewriting the plan's claims about `reportDisabled`, the far-side failure lines, or the completed search core; they are accurate.
- Any other plan, including the `ready/` plans that already point at the `complete/` location.
- `src/`, tests, or configuration.
- The PR description; the recorded entry calls for no description change.

## Rating basis

lines_added=0, files_edited=0, requirements=1, scenarios=0, new_units=0. Production counts are zero because the only edited file is a plan; the single requirement is that both links resolve to the promoted subplan. p = 1.578 + 0.705·ln(2) = 2.07, under the 3.461 threshold for 1.
