# Align the repoint verification plan's scope statements with its stale-link exception

**Complexity: 1/10** — two bullets reworded in one completed plan, no production files, 2 requirements (p=2.35)

## Goal

`product/plans/complete/web-search-repoint-reference-verification-scope.md` must tell one story about what its repair touched. It currently says in Design decisions that the five edited subplans, the completion plan, and the default-grants subplan "are all accurate as they stand", and repeats in Out of scope that those files' "paths and prose are as intended" — while its Issue, its Approach, and the very next Out of scope bullet call the draft-folder completion link in `product/plans/complete/web-search-13-default-grants.md` a pre-existing stale reference that does not resolve. The same bullet also calls the four edited subplans five, and there are five edited references across four subplans, not five subplans.

## Issue

Recorded on PR #2010's branch backlog, severity 2/10:

> Correct the verification fix plan's scope statements, which call the stale default-grants subplan accurate and count four edited subplans as five.

The conflict is internal to one plan file:

- Design decisions, bullet "Correct the prose, not the subplans", reads "The five edited subplans, the completion plan, and the default-grants subplan are all accurate as they stand."
- Out of scope reads "The five edited subplans, `product/plans/complete/web-search-14-completion.md`, and `product/plans/complete/web-search-13-default-grants.md`; all of their paths and prose are as intended."
- The plan's Issue and the next Out of scope bullet both record that `product/plans/complete/web-search-13-default-grants.md` line 82 links the completion plan through the draft folder, where it never lived, and that the link is pre-existing and left for a separate cleanup.

A reader checking whether the repair left the default-grants link correct meets two opposite statements in one record. "Accurate as they stand" can make the stale link look intentional and let it survive the separate cleanup the plan assigns it to, or it can prompt a fresh review of scope the plan already closed.

Verified against the branch: the repoint commit `ef5e68d1` edited five references across four subplans — `web-search-1-command-grammar.md`, `web-search-6-search-core.md`, two in `web-search-10-typed-command.md`, and `web-search-12-acp-tool.md` — and did not touch `web-search-13-default-grants.md`, whose draft-folder completion link predates the repair.

## Approach

1. In `product/plans/complete/web-search-repoint-reference-verification-scope.md`, under `## Design decisions`, rewrite the "Correct the prose, not the subplans" bullet so the four edited subplans and the completion plan are the files called accurate as they stand, and `product/plans/complete/web-search-13-default-grants.md` is described as deliberately left unchanged and still carrying the pre-existing stale draft-folder completion link. Keep the bullet's closing point that only the repoint plan's verification claim overstated the repair.
2. Under `## Out of scope`, change "The five edited subplans" to "The four edited subplans" and drop `product/plans/complete/web-search-13-default-grants.md` from the "paths and prose are as intended" list, leaving the next bullet as the sole record of that stale link.
3. Change no other section of the plan, and leave the repoint plan's corrected Tests bullet, the four edited subplans, `product/plans/complete/web-search-14-completion.md`, `product/plans/complete/web-search-13-default-grants.md`, the spec correction, and every source and test file unchanged.

## Design decisions

- **Count references and subplans separately.** The repair edited five references, and those five references live in four subplans. Calling the subplans five is the error; the H1, Issue, Approach, Tests, and Verification sections all say "five edited references", which is correct and stays.
- **Name the stale link once, as an exception.** The default-grants file is unchanged by this repair and its draft-folder completion link is the one known stale reference. Its Design decisions entry should say so plainly, and the Out of scope bullet below it remains the single record of what happens to that link.
- **Do not touch the file the exception describes.** Correcting the plan's prose is the whole repair; editing `web-search-13-default-grants.md` would fold the separate cleanup into this one.

## Proposed changes

Two bullets in `product/plans/complete/web-search-repoint-reference-verification-scope.md` change. The Design decisions bullet becomes:

```markdown
- **Correct the prose, not the subplans.** The four edited subplans and the completion plan are accurate as they stand, while `product/plans/complete/web-search-13-default-grants.md` is deliberately left unchanged and still carries the pre-existing stale draft-folder completion link. Only the repoint plan's verification claim overstated the repair.
```

The Out of scope bullet becomes:

```markdown
- The four edited subplans and `product/plans/complete/web-search-14-completion.md`; their paths and prose are as intended.
```

No source, test, config, spec, `help/`, user-documentation, other plan, or PR description change. The repoint plan's corrected Tests bullet, the spec correction, and the default-grants subplan are left exactly as they are.

## Tests

No automated test covers plan prose, and this fix changes no code. The existing suite must keep passing unchanged through `$janissary/scripts/run.mjs check-diff`.

Verify by reading and by search:

- The Design decisions bullet now counts four edited subplans, calls the completion plan accurate as it stands, and describes `product/plans/complete/web-search-13-default-grants.md` as unchanged while still carrying the pre-existing stale draft-folder completion link.
- The Out of scope bullet now counts four edited subplans, lists only the completion plan beside them, and no longer claims the default-grants file's prose is as intended.
- The plan's Issue, Approach, Proposed changes, Tests, Out of scope, and Verification sections consistently count four edited subplans and name the default-grants draft link as the one known stale exception.
- A repository-wide search for `web-search-14-completion` still shows only that draft link, in `product/plans/complete/web-search-13-default-grants.md`, outside `product/plans/complete/` references.

## Verification

- `$janissary/scripts/run.mjs check-diff` (plan-only; no source or test change).
- Read the fix plan's Issue, Approach, Design decisions, Proposed changes, Tests, Out of scope, and Verification sections together and confirm they agree on four edited subplans and one stale exception.
- Repository-wide search for `web-search-14-completion`: the edited references and the completion plan's own path use `product/plans/complete/`; the draft-folder reference at `product/plans/complete/web-search-13-default-grants.md` line 82 is the only stale one, and it is deliberately out of scope.

## Spec

No `./product/specs/` update. This corrects internal plan prose; it changes no user-visible behavior.

## Out of scope

- The repoint plan's corrected Tests bullet; it already scopes the check and records the same stale link.
- The four edited subplans, `product/plans/complete/web-search-14-completion.md`, and `product/plans/complete/web-search-13-default-grants.md`; their paths and prose stay as they are, including the stale draft link the Out of scope bullet above records.
- The spec correction and every source and test file.
- Other plans, help pages, and user documentation.
- The PR description; the recorded entry calls for no description change.
- The PR's conflict with `master`; it is left unresolved.

## Rating basis

lines_added=0, files_edited=0, requirements=2, scenarios=0, new_units=0. Production counts are zero because the only edited file is a completed plan. The two requirements are the corrected Design decisions bullet and the corrected Out of scope bullet. p = 1.578 + 0.705·ln(3) = 2.35, under the 3.461 threshold for 1.
