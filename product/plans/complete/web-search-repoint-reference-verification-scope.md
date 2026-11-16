# Scope the repoint plan's reference verification to the five edited links

**Complexity: 1/10** — no production lines or files, one verification bullet corrected and 1 requirement (p=2.07)

## Goal

`product/plans/complete/web-search-repoint-completion-plan-reference.md` must verify what it actually repaired. Its Tests section claims that every `web-search-14-completion` reference resolves under `product/plans/complete/`, but the plan's own Out of scope section leaves the draft-folder completion link in `product/plans/complete/web-search-13-default-grants.md` alone, so the repository-wide search the plan tells a reader to run finds a reference the plan said could not exist. The verification must be scoped to the five links the repair changed and name the remaining draft link as a known pre-existing stale link that is out of scope.

## Issue

Recorded on PR #2010's branch backlog, severity 2/10:

> Correct the repoint fix plan's verification claim that every completion-plan reference resolves under the completed folder, which the draft reference it leaves out of scope falsifies.

The Tests section of `product/plans/complete/web-search-repoint-completion-plan-reference.md` says:

> - Every `web-search-14-completion` reference resolves under `product/plans/complete/`.

That claim is broader than the repair. The plan edited five references across four completed subplans — `web-search-1-command-grammar.md`, `web-search-6-search-core.md` (two in `web-search-10-typed-command.md`), and `web-search-12-acp-tool.md` — and all five now resolve under `product/plans/complete/`. But `product/plans/complete/web-search-13-default-grants.md` still links the completion plan through the draft folder, where it never lived. The same plan's Out of scope section names that draft reference and explicitly excludes it:

> - The draft-folder completion reference in `product/plans/complete/web-search-13-default-grants.md`; it is not one of the five references this entry names.

Verified against the branch:

- `git show --stat ef5e68d1` (the repoint commit) lists `web-search-1-command-grammar.md`, `web-search-6-search-core.md`, `web-search-10-typed-command.md`, and `web-search-12-acp-tool.md`, plus the promoted fix plan and the backlog removal. `web-search-13-default-grants.md` is not in it.
- A repository-wide search for `web-search-14-completion` returns the five edited references under `product/plans/complete/`, the completion plan's own path, and the one draft-folder reference at `product/plans/complete/web-search-13-default-grants.md` line 82.
- `git log --oneline -- product/plans/complete/web-search-13-default-grants.md` shows the draft link predates the repoint commit and was never touched by it, so it is pre-existing rather than a missed link from this promotion.

A reader following the plan's Tests section runs that search, finds the draft link, and can only conclude either that the repair is incomplete or that the plan's Out of scope section should be disregarded. Both readings reopen work this entry deliberately left for a separate cleanup.

## Approach

1. In `product/plans/complete/web-search-repoint-completion-plan-reference.md`, under `## Tests`, replace the bullet "Every `web-search-14-completion` reference resolves under `product/plans/complete/`." with a bullet that scopes the check to the five edited references and names the draft-folder completion link in `product/plans/complete/web-search-13-default-grants.md` as the pre-existing stale link this repair leaves out of scope.
2. Keep the other Tests bullets unchanged: the ready-folder path search still returns no matches, and the completion plan still exists on the branch.
3. Change no other section of the plan, and leave the four edited subplans, `product/plans/complete/web-search-14-completion.md`, `product/plans/complete/web-search-13-default-grants.md`, the spec correction, and every source and test file unchanged.

## Design decisions

- **Scope the claim to what the repair did.** Five links were edited and five now resolve under `complete/`; asserting anything about every reference turns a narrow, verified repair into a claim about files the entry never touched.
- **Name the draft link where the reader will look.** The Tests bullet is the instruction a reader follows, so the exception belongs there rather than only in Out of scope. Repeating it in both places is deliberate: the test verifies the edited links, and the out-of-scope note records the untouched one.
- **Describe the draft link without quoting its full path.** The plan's design decisions already avoid quoting the stale literal so the verifying search stays clean; naming the file and the draft folder identifies the reference without adding a fresh `web-search-14-completion` match to the plan itself.
- **Correct the prose, not the subplans.** The five edited subplans, the completion plan, and the default-grants subplan are all accurate as they stand. Only the fix plan's verification claim overstates the repair.

## Proposed changes

One markdown file changes. In `product/plans/complete/web-search-repoint-completion-plan-reference.md`, the second bullet of the `## Tests` verification list becomes:

```markdown
- Each of the five edited references resolves under `product/plans/complete/`. The draft-folder completion link in `product/plans/complete/web-search-13-default-grants.md` is the pre-existing stale link that this repair leaves out of scope, as the Out of scope section records.
```

No source, test, config, spec, `help/`, user-documentation, other plan, or PR description change.

## Tests

No automated test covers plan prose, and this fix changes no code. The existing suite must keep passing unchanged through `$janissary/scripts/run.mjs check-diff`.

Verify the corrected bullet by search and by reading it:

- The `## Tests` bullet now claims only that the five edited references resolve under `product/plans/complete/`.
- The bullet names `product/plans/complete/web-search-13-default-grants.md` as the file whose draft-folder completion link is the pre-existing stale reference left out of scope.
- A repository-wide search for the completion plan's ready-folder path still returns no matches.
- `product/plans/complete/web-search-14-completion.md` exists on the branch.

## Verification

- `$janissary/scripts/run.mjs check-diff` (plan-only; no source or test change).
- Repository-wide search for `web-search-14-completion`: the five edited references and the completion plan's own path use `product/plans/complete/`, and the draft-folder reference in `product/plans/complete/web-search-13-default-grants.md` is the only non-complete reference, explicitly out of scope.
- Read the corrected Tests bullet beside the plan's Out of scope section and confirm they describe the same one exception.

## Spec

No `./product/specs/` update. This corrects internal plan prose; it changes no user-visible behavior.

## Out of scope

- The five edited subplans, `product/plans/complete/web-search-14-completion.md`, and `product/plans/complete/web-search-13-default-grants.md`; all of their paths and prose are as intended.
- The draft-folder completion link in `product/plans/complete/web-search-13-default-grants.md`; it is the pre-existing stale link this plan records as out of scope, not one it repairs.
- The repoint plan's Goal, Issue, Approach, Design decisions, Proposed changes, Verification, Spec, Out of scope, and Rating basis.
- Every other plan, including the `ready/` plans that point at other subplans.
- Source, tests, specs, help pages, or configuration.
- The PR description; the recorded entry calls for no description change.
- The PR's conflict with `master`; it is left unresolved.

## Rating basis

lines_added=0, files_edited=0, requirements=1, scenarios=0, new_units=0. Production counts are zero because the only edited file is a completed plan. The single requirement is that the repoint plan's verification claim cover the five edited references and name the pre-existing draft-folder link as out of scope. p = 1.578 + 0.705·ln(2) = 2.07, under the 3.461 threshold for 1.
