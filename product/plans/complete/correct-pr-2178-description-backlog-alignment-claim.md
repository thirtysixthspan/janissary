# Correct the pull request 2178 description's false backlog-alignment claim

**Complexity: 1/10** — 0 production lines or files edited, 5 prose requirements, no test scenarios or new units (p=2.84); a single-sentence PR-body deletion.

## Goal

Pull request 2178's description claims the feature "aligns with the first `## ready` item in `product/backlog/features.md`, whose text is the feature description." That backlog item actually asks for a Lifecycle matrix in the plan template and has nothing to do with user documentation, so the claim misstates the feature's provenance and cannot be verified by a reader. Delete only that unsupported sentence, keep the accurate sentence about the feature being supplied at invocation with its goal settled by the user, and leave every other paragraph of the description exactly as written.

## Requirements

1. "delete the sentence claiming the feature aligns with the first `## ready` item in `product/backlog/features.md`" (Proposal).
2. "keeping the preceding sentence that states the feature was supplied at task invocation without a matching backlog entry and the user settled its goal" (Proposal).
3. "Execute ... `work-pull-request-issue.md`" with the exact work item "correct the description's false backlog-alignment claim" (Proposal).
4. "Use `gh pr edit --body-file` after the branch is pushed, preserving every other paragraph of the description exactly as written" (Proposal).
5. "No code or spec changes are involved and no test covers prose, so verify by reading the corrected body" (Proposal).

## Design decisions

- The description is a live GitHub artifact, so the correction is applied with `gh pr edit --body-file ./temp/pr-body.md` only after the branch is pushed, never before (task Step 8.5).
- `gh pr edit` replaces the body wholesale, so the full revised body is written to `./temp/pr-body.md` with the single sentence removed and every other paragraph byte-for-byte unchanged.
- The fix changes no application behavior and adds no code, so it introduces no tests and touches no spec, help page, or documentation tree.
- A plan file is still written and promoted to `complete/`, and the resolved backlog entry is still removed, so the push carries tracked bookkeeping changes (task Step 8.2).

## Assumptions

1. `https://github.com/thirtysixthspan/janissary/pull/2178` body: "It aligns with the first `## ready` item in `product/backlog/features.md`, whose text is the feature description." — this is the sentence to delete.
2. `product/backlog/features.md:5` — the first `## ready` item begins "This is a documentation-only change to the pipeline that authors, improves, rates, decomposes and promotes plans." and asks for a Lifecycle matrix in `ai/guidelines/plan-template.md`, confirming the claimed alignment is false.
3. `gh pr view ... --json body` — the preceding sentence "The feature is named "user documentation" and was supplied at task invocation without a matching backlog entry, but the user settled its goal as "documentation changes are not part of pull request reviews or plans"." is accurate and is retained.
4. `./product/backlog/pull-request.md:5` — the recorded summary bullet "Correct the description's claim that the feature aligns with a ready backlog item that actually describes an unrelated planning-template change." identifies the work item.

## Existing functionality

1. `gh pr view <reference> --json body` reads the current description so the revised body can be derived from the author's exact text.
2. `gh pr edit <reference> --body-file ./temp/pr-body.md` applies a multi-line body from a gitignored scratch file without shell-quoting damage (task Step 8.5).
3. `$janissary/scripts/run.mjs check-diff` is the diff-scoped lint, typecheck, and test gate used for the bookkeeping changes.

## Implementation steps

1. Read the current description with `gh pr view <reference> --json body` and capture its exact text.
2. Write the full revised body to `./temp/pr-body.md`: remove only "It aligns with the first `## ready` item in `product/backlog/features.md`, whose text is the feature description." and keep the preceding provenance sentence and every other paragraph unchanged.
3. Promote this plan from `./product/plans/ready/` to `./product/plans/complete/` and remove the resolved entry from `./product/backlog/pull-request.md`, leaving all other entries byte-for-byte unchanged.
4. Commit the bookkeeping changes and push to the PR's existing head branch.
5. After the push succeeds, apply the correction with `gh pr edit <reference> --body-file ./temp/pr-body.md`, leaving the title and all other paragraphs untouched.
6. Confirm the PR remains OPEN and its `headRefOid` matches the pushed `HEAD`.

## UI design

None. The change is to a GitHub pull request description, not to an application interface.

## Tests

This plan changes no application behavior and introduces no code, so it adds no tests. Per the plan template, prose is verified by reading the corrected body rather than by automated tests.

## Out of scope

No source, test, spec, help-page, or documentation-tree edits; no change to the PR title or to any paragraph of the description other than the named sentence; no merge, close, or replacement of the pull request.

## Verification

Run `$janissary/scripts/run.mjs check-diff` for the bookkeeping changes. Then read `gh pr view <reference> --json body` and confirm the sentence about the user settling the feature's goal stands on its own with no backlog-alignment claim, that the rest of the body is unchanged paragraph for paragraph, and that the PR is still OPEN on the same head branch.
