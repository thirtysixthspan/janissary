# Repoint the completed subplans at the completion plan's new complete path

**Complexity: 1/10** — five path corrections inside four completed plans, no production files or behavior (p=2.07).

## Goal

The four completed subplans that defer completion work to the final web-search slice must reach it through a path that exists. Each still points at the completion plan's former `ready/` location, and the file now lives at `./product/plans/complete/web-search-14-completion.md`.

## Issue

Recorded on PR #2010's branch backlog, severity 3/10:

> Repair the completed subplan links that still point at the completion plan's previous location.

Promoting the completion plan from the ready folder to the completed folder left five inbound references behind, spread across four files:

| Plan | References |
| --- | --- |
| `product/plans/complete/web-search-1-command-grammar.md` | 1 (Out of scope, Completion bullet, line 91) |
| `product/plans/complete/web-search-6-search-core.md` | 1 (Design decisions, process-wide registry bullet, line 21) |
| `product/plans/complete/web-search-10-typed-command.md` | 2 (Design decisions, behavior-spec bullet, line 33; Out of scope, Completion bullet, line 97) |
| `product/plans/complete/web-search-12-acp-tool.md` | 1 (Out of scope, Completion bullet, line 103) |

Each sentence defers the completion work, spec section, or provider-name export to the final slice. That claim is historical and stays true; only the folder in the path is wrong. A reader or agent following the subplan chain lands on a file that no longer exists and cannot tell whether the completion work was abandoned, moved, or never written.

## Approach

1. In each of the four plans, replace the completion plan's ready-folder path with `./product/plans/complete/web-search-14-completion.md`.
2. Leave the surrounding sentences and their deferral wording untouched; only the folder in the path changes.
3. Change no other plan, source, test, spec, help page, or configuration file.
4. Verify by searching the repository for the completion plan's ready-folder path and confirming no match remains, then confirm the promoted plan exists under `product/plans/complete/`.

## Design decisions

- **Repoint to `complete/`, do not restore `ready/`.** The completion plan is implemented and its status folder records that; recreating a copy under the ready folder would duplicate the plan and misstate its state.
- **Change the path only, not the sentence.** Every one of the five sentences describes a deferral that was real when its slice landed. Repointing the link is what the promotion missed; rewriting the history would say something that did not happen.
- **Keep the deferral wording.** The behavior spec, the ACP sections, and the provider-name export all arrived in their own slices. Saying they were deferred remains an accurate account of the subplan's scope, and the link now leads to the slice that delivered them.
- **Verify by repository-wide search.** The failure was a missed inbound link during a promotion, so the check that catches it is a search for the stale path across the repository, not a re-read of the edited files.
- **Keep the fix plan itself free of the stale literal.** A plan that quoted the old path verbatim would keep the verifying search matching, so this plan names the ready folder and the completion plan separately.
- **Leave the pre-existing stale links alone.** The ready-folder links to `web-search-12-acp-tool` and `web-search-13-default-grants` predate this promotion and belong to a separate cleanup; the recorded entry names them as out of scope.

## Proposed changes

Only these four plan files change, all under `product/plans/complete/`:

- **`web-search-1-command-grammar.md`** — one path, in the Out of scope Completion bullet.
- **`web-search-6-search-core.md`** — one path, in the Design decisions process-wide registry bullet.
- **`web-search-10-typed-command.md`** — two paths, in the Design decisions behavior-spec bullet and the Out of scope Completion bullet.
- **`web-search-12-acp-tool.md`** — one path, in the Out of scope Completion bullet.

Every changed link becomes `./product/plans/complete/web-search-14-completion.md`.

No source, test, spec, help, or configuration change. No other plan changes.

## Tests

No automated test covers plan prose, and this fix changes no code. The existing suite must keep passing unchanged through `$janissary/scripts/run.mjs check-diff`.

Verify the references by search:

- A repository-wide search for the completion plan's ready-folder path returns no matches.
- Every `web-search-14-completion` reference resolves under `product/plans/complete/`.
- `product/plans/complete/web-search-14-completion.md` exists on the branch.

## Verification

- `$janissary/scripts/run.mjs check-diff` (plan-only; no source or test change).
- Repository-wide search for the stale ready-folder completion path and for every remaining reference to the completion plan.
- Re-read the five edited lines and confirm each path's file exists.

## Spec

No `./product/specs/` update. This repairs internal plan links; it changes no user-visible behavior.

## Out of scope

- Rewriting the subplans' deferral sentences or their claims about the completion work; they record what each slice did.
- The pre-existing stale ready-folder links to `web-search-12-acp-tool` and `web-search-13-default-grants`; the recorded entry leaves them for a separate cleanup.
- The draft-folder completion reference in `product/plans/complete/web-search-13-default-grants.md`; it is not one of the five references this entry names.
- Any other plan, including the `ready/` plans that point at other subplans.
- Source, tests, specs, help pages, or configuration.
- The PR description; the recorded entry calls for no description change.
- The PR's conflict with `master`; it is left unresolved.

## Rating basis

lines_added=0, files_edited=0, requirements=1, scenarios=0, new_units=0. Production counts are zero because the only edited files are completed plans; the single requirement is that all five completion-plan links resolve to the promoted plan. p = 1.578 + 0.705·ln(2) = 2.07, under the 3.461 threshold for 1.
