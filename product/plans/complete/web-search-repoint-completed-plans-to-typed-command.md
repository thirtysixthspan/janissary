# Repoint the completed repair plans at the promoted typed-command subplan

**Complexity: 1/10** — nine path corrections inside six completed plans, no production files or behavior (p=2.07).

## Goal

The six completed repair plans that defer their behavior spec to the typed-command subplan must reach it through a path that exists. Each points at the subplan's former pending-folder location, and the file now lives at `./product/plans/complete/web-search-10-typed-command.md`.

## Issue

Recorded on PR #2010's branch backlog, severity 3/10:

> Complete the plan promotion by repointing the six completed repair plans that still link to the typed-command subplan at its old ready path.

The promotion commit moved the typed-command subplan into the completed folder but left nine inbound links behind, spread across six files:

| Plan | References |
| --- | --- |
| `product/plans/complete/web-search-activation-failure-classification.md` | 3 (lines 34, 88, 95) |
| `product/plans/complete/web-search-provider-page-remote-plan-link.md` | 1 (line 61) |
| `product/plans/complete/web-search-provider-page-disabled-resolution-lines.md` | 1 (line 73) |
| `product/plans/complete/web-search-provider-page-token-row.md` | 1 (line 54) |
| `product/plans/complete/web-search-provider-page-expected-failure-fallback.md` | 2 (lines 89, 98) |
| `product/plans/complete/web-search-per-attempt-request.md` | 1 (line 82) |

Each of these sentences records that the behavior spec was deferred because the typed-command plan owned it. The claim is historical and stays true, but the reader following the link lands on a missing file and cannot tell whether the typed-command work was abandoned, moved, or never written.

## Approach

1. In each of the six plans, replace every occurrence of the pending-folder typed-command path with `./product/plans/complete/web-search-10-typed-command.md`.
2. Leave the surrounding sentences and their deferral wording untouched; only the folder in the path changes.
3. Change no other plan, source, test, spec, help page, or configuration file.
4. Verify by searching `product/` for any reference to `web-search-10` under the pending folder and confirming none remains, then confirm the promoted subplan exists under `product/plans/complete/`.

## Design decisions

- **Repoint to `complete/`, do not restore `ready/`.** The subplan is implemented and its status folder records that; recreating a copy under the pending folder would duplicate the plan and misstate its state.
- **Change the path only, not the sentence.** Every one of the nine sentences describes a deferral that was real at the time of its repair. Repointing the link is what the promotion missed; rewriting the history would say something that did not happen.
- **Keep the deferral wording.** The behavior spec was written later, by the typed-command slice. Saying it is "still deferred" in a completed repair plan remains an accurate account of that repair's scope, and the link now leads to the slice that delivered it.
- **Verify by repository-wide search.** The failure was a missed inbound link during a promotion, so the check that catches it is a search for the stale path across `product/`, not a re-read of the edited files.
- **Keep the fix plan itself free of the stale literal.** A plan that quoted the old path verbatim would keep the verifying search matching, so this plan names the pending folder and the subplan separately.
- **No new subplan for the links.** Adding a file per reference would be the kind of reference churn the fix exists to reduce.

## Proposed changes

Only these six plan files change, all under `product/plans/complete/`:

- **`web-search-activation-failure-classification.md`** — three paths, in the `## Out of scope`-style "No contract or spec change" bullet, the `## Spec` paragraph, and the out-of-scope "Writing `product/specs/web-search.md` ahead of …" item.
- **`web-search-provider-page-remote-plan-link.md`** — one path, in the `## Spec` paragraph.
- **`web-search-provider-page-disabled-resolution-lines.md`** — one path, in the out-of-scope "Writing a web search behavior spec ahead of …" item.
- **`web-search-provider-page-token-row.md`** — one path, in the `## Spec` paragraph.
- **`web-search-provider-page-expected-failure-fallback.md`** — two paths, in the `## Spec` paragraph and the out-of-scope "Writing a web search behavior spec ahead of …" item.
- **`web-search-per-attempt-request.md`** — one path, in the `## Spec` paragraph.

No source, test, spec, help, or configuration change. No other plan changes.

## Tests

No automated test covers plan prose, and this fix changes no code. The existing suite must keep passing unchanged through `$janissary/scripts/run.mjs check-diff`.

Verify the references by search:

- A search of `product/` for `web-search-10` under the pending folder returns no matches (`grep -rn "plans/ready/" product | grep "web-search-10"`).
- Every `web-search-10-typed-command` reference resolves under `product/plans/complete/`.
- `product/plans/complete/web-search-10-typed-command.md` exists on the branch.

## Verification

- `$janissary/scripts/run.mjs check-diff` (plan-only; no source or test change).
- Repository-wide search for the stale pending-folder path and for every remaining reference to the subplan.
- Re-read the nine edited lines and confirm each path's file exists.

## Spec

No `./product/specs/` update. This repairs internal plan links; it changes no user-visible behavior.

## Out of scope

- Rewriting the plans' deferral sentences or their claims about the behavior spec; they record what each repair did.
- Any other plan, including the `ready/` plans that point at other subplans.
- Source, tests, specs, help pages, or configuration.
- The PR description; the recorded entry calls for no description change.

## Rating basis

lines_added=0, files_edited=0, requirements=1, scenarios=0, new_units=0. Production counts are zero because the only edited files are plans; the single requirement is that all nine links resolve to the promoted subplan. p = 1.578 + 0.705·ln(2) = 2.07, under the 3.461 threshold for 1.
