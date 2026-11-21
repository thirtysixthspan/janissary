# Correct the trailing dock word verification step

**Complexity: 1/10** — no production code, tests, specs, or docs: the canonical plan and the PR description already carry the correct expectation (p=2.07).

## Goal

Tell the reviewer what `sql file <path> left` actually reports, so following the verification step does not record a false failure. The entry records a stale verification line in the original base-branch `product/plans/ready/sql-path.md` that expected the usage line. On this branch the command takes the trimmed remainder verbatim, so ` left` stays part of the path and the command reports `No database file at "<path> left".` rather than usage.

## Design decisions

- A completed plan is a historical record, not a live artifact. The canonical plan now lives at `product/plans/complete/sql-path.md`, and its Verification already states that `sql file <path> left` reports `No database file at "<path> left".` rather than usage. It is not edited.
- The PR description's How to verify already carries the same expectation in step 12 and in the Behavior examples (`sql file <path> left` → `No database file at "<path> left".`). No live incorrect line exists there, so no description correction is applied.
- The "Additional test cases" section belongs to `product/backlog/test-pull-request.md`, not this entry, so it is left untouched.
- The only writes are this fix plan and the removal of this entry from `./product/backlog/pull-request.md`. Nothing on the base branch or master is touched.

## What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| Correct expectation in the canonical plan | the rewritten Verification bullet | `product/plans/complete/sql-path.md` |
| Correct expectation in the PR description | step 12 and the Behavior examples | PR 2162 "How to verify" |
| Correct behavior description in the spec | verbatim value, trailing `left` stays in the path | `product/specs/sql-database.md` |
| The behavior itself | trimmed remainder taken verbatim, no dock-word special case | `src/plugins/sql/activate.ts` |

## Implementation steps

1. Record this fix plan: draft it, rate it quantitatively, and promote it through `ready/` to `product/plans/complete/`, documenting that the verification expectation is already correct in every live artifact.
2. Remove the resolved entry from `./product/backlog/pull-request.md`. Because it is the only remaining entry, restore the file to the exact master comment-and-heading skeleton.
3. Make no code, test, spec, documentation, or PR-description edits, and add no "Additional test cases" edit.

## Tests

None, and none needed: the artifact is a stale verification step in a base-branch plan, and the behavior it describes is already pinned by the existing suite (`src/plugins/sql/activate.test.ts` covers a trailing `left` in a file value staying verbatim and yielding the missing-file line). This fix adds no test cases.

## Out of scope

- Editing `product/plans/complete/sql-path.md`, any other plan, or any file on the base branch or master.
- Editing the PR description, its title, or any other paragraph of it.
- Editing the "Additional test cases" section, which belongs to `product/backlog/test-pull-request.md`.
- Adding code, tests, specs, help pages, or user documentation.
- Merging or closing the PR, or rewriting published history.

## Verification

- Confirm `product/plans/complete/sql-path.md` Verification says `sql file <path> left` reports `No database file at "<path> left".` rather than the usage line.
- Confirm PR 2162 "How to verify" step 12 and the Behavior examples say the same, confirming no live artifact states the stale usage expectation.
- Run `$janissary/scripts/run.mjs check-diff` to confirm no lint, typecheck, or test regressions.
