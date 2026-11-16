# Repoint the stale inbound links at the promoted workspace-routes subplan

**Complexity: 1/10** — thirteen path corrections inside eight plans, no production files or behavior (p=2.07).

## Issue

Recorded on PR #2010's branch backlog, severity 3/10:

> Complete the subplan promotion by repointing the thirteen stale inbound links that still point at the workspace-routes subplan's former ready-folder path, closing the technical-debt gap the rename left.

The promotion commit moved the workspace-routes subplan into the completed folder but left thirteen inbound links behind, spread across eight plan files:

| Plan | References |
| --- | --- |
| `product/plans/complete/web-search-1-command-grammar.md` | 1 (line 5) |
| `product/plans/complete/web-search-3-provider-tokens.md` | 1 (line 62) |
| `product/plans/complete/web-search-6-search-core.md` | 2 (lines 92, 96) |
| `product/plans/complete/web-search-7-remote-operation.md` | 1 (line 74) |
| `product/plans/complete/web-search-8-remote-port.md` | 1 (line 65) |
| `product/plans/complete/web-search-10-typed-command.md` | 3 (lines 16, 25, 94) |
| `product/plans/ready/web-search-12-acp-tool.md` | 3 (lines 5, 14, 98) |
| `product/plans/ready/web-search-13-default-grants.md` | 1 (line 80) |

Every one of those links now lands on a missing file. The next slice's plan (`web-search-12-acp-tool.md`) names the workspace-routes work as a dependency, so an agent picking it up follows a link that cannot tell it whether the routes were moved, abandoned, or never written. The other seven files cite the same subplan for the routing hook, the `searchWebInTab` shape and its signal, and the far-side loop's own search route.

## Goal

Every reference to `web-search-11-workspace-routes.md` under `product/plans/` resolves under `product/plans/complete/`, including the dependency bullet in the next slice's plan. No sentence, claim, deferral wording, or other path changes.

## Approach

Replace only the folder in each of the thirteen paths, from `ready/` to `complete/`. Leave the surrounding sentence, the named outcomes and failure lines, the deferral wording, and every other reference exactly as it is. The promoted subplan already exists at `product/plans/complete/web-search-11-workspace-routes.md`, so the corrected paths have a target.

The thirteen occurrences were verified against the checked-out branch and match the counts in the table above. The two references in `product/backlog/pull-request.md` disappear when the resolved entry is removed, not by rewriting the entry's text.

## Design decisions

- **Repoint to `complete/`, do not restore `ready/`.** The subplan is implemented and its status folder records that; recreating a copy under the pending folder would duplicate the plan and misstate its state.
- **Change the path only, not the sentence.** Every one of the thirteen sentences cites the workspace-routes work for a behavior it delivered. Repointing the link is what the promotion missed; rewriting the citations would say something that did not happen.
- **Keep the deferral wording.** The routing hook, the tab helper's signal, and the far-side loop's route were written by the workspace-routes slice. Saying they are described elsewhere remains an accurate account of each plan's scope, and the link now leads to the slice that delivered them.
- **Verify by repository-wide search.** The failure was a missed inbound link during a promotion, so the check that catches it is a search for the stale path across `product/`, not a re-read of the edited files.
- **Keep the fix plan itself free of the stale literal.** A plan that quoted the old path verbatim would keep the verifying search matching, so this plan names the folder and the subplan separately.
- **No new subplan for the links.** Adding a file per reference would be the kind of reference churn the fix exists to reduce.

## Proposed changes

Only these eight plan files change, and only the folder in each workspace-routes path:

- **`product/plans/complete/web-search-1-command-grammar.md`** — one path, in the "Later slices import these names" list.
- **`product/plans/complete/web-search-3-provider-tokens.md`** — one path, in the out-of-scope bullet about passing merged tokens to the far-side ACP loop.
- **`product/plans/complete/web-search-6-search-core.md`** — two paths, in the out-of-scope "No manual app check" bullet and the final "Calling `webSearch`" bullet.
- **`product/plans/complete/web-search-7-remote-operation.md`** — one path, in the out-of-scope bullet naming the far-side loop's own search route.
- **`product/plans/complete/web-search-8-remote-port.md`** — one path, in the out-of-scope bullet about passing tokens to the far-side ACP loop.
- **`product/plans/complete/web-search-10-typed-command.md`** — three paths, in the ordering paragraph, the `searchWebInTab` design bullet, and the out-of-scope bullet about the ACP workspace routes.
- **`product/plans/ready/web-search-12-acp-tool.md`** — three paths, in the overview paragraph, the dependency bullet, and the out-of-scope bullet saying the `runWorkspace` routes are not edited here.
- **`product/plans/ready/web-search-13-default-grants.md`** — one path, in the out-of-scope bullet about vocabulary, tool table, primer, and routing changes.

No source, test, spec, help, or configuration change. No other plan changes.

## Implementation steps

1. In `product/plans/complete/web-search-1-command-grammar.md`, `web-search-3-provider-tokens.md`, `web-search-7-remote-operation.md`, and `web-search-8-remote-port.md`, repoint each workspace-routes path to the completed folder.
2. In `product/plans/complete/web-search-6-search-core.md` and `web-search-10-typed-command.md`, repoint all two and three workspace-routes paths respectively.
3. In `product/plans/ready/web-search-12-acp-tool.md` and `web-search-13-default-grants.md`, repoint all three and one workspace-routes paths respectively.
4. Re-grep `product/` for the former ready-folder path and confirm no matches remain, confirm every `web-search-11-workspace-routes` reference resolves under `product/plans/complete/`, then run `$janissary/scripts/run.mjs check-diff`.

## Tests

None. The change is text inside plan documents; no behavior, type, or executable code changes, so no test can distinguish before from after. Verification is the repository-wide search for the former path and for every remaining reference, plus `$janissary/scripts/run.mjs check-diff` for the documentation-only diff.

## Verification

- A search of `product/` for the workspace-routes subplan under the ready folder returns no matches.
- Every `web-search-11-workspace-routes` reference resolves under `product/plans/complete/`.
- `product/plans/complete/web-search-11-workspace-routes.md` exists on the branch.
- `$janissary/scripts/run.mjs check-diff` (plan-only; no source or test change).
- Re-read the thirteen edited lines and confirm each surrounding sentence and every other link is unchanged.

## Spec

No `./product/specs/` update. This repairs internal plan links; it changes no user-visible behavior.

## Out of scope

- Rewriting the plans' sentences or their claims about the workspace-routes work; they record what each plan did.
- Any other plan, including the `ready/` plans that point at other subplans.
- Source, tests, specs, help pages, or configuration.
- The PR description; the recorded entry calls for no description change.

## Rating basis

lines_added=0, files_edited=0, requirements=1, scenarios=0, new_units=0. Production counts are zero because the only edited files are plans; the single requirement is that all thirteen links resolve to the promoted subplan. p = 1.578 + 0.705·ln(2) = 2.07, under the 3.461 threshold for 1.
