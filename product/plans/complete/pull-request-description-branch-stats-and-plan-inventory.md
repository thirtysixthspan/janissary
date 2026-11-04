# Pull request description reports current branch statistics and every plan beside the canonical plan

**Complexity: 2/10** — a description correction. No source, test, spec, or documentation file changes. The only edits are to this plan and the pull request backlog, and to the body of pull request #1916, which is applied after the push.

## Goal

Make the body of pull request #1916 report the branch's current size and stop claiming the canonical plan is the branch's only plan. The title stays as it is.

## Problem

Checked against `git rev-list --count 139aaf43..HEAD`, `git diff --name-only 139aaf43...HEAD`, and `product/plans/complete/`, the body is wrong in two places.

- It says the branch carries 93 commits and 232 changed files from `139aaf43`, while the branch has advanced well past that. The exact figures need recomputing at the published head, and the description's own bookkeeping commit moves them again, so they are taken only after the push.
- It says the feature's implementation subplans and repair plans were folded into the canonical plan and removed, so `product/plans/complete/connections-tabs.md` is the branch's only plan for this feature. The canonical plan is still there, but focused repair plans from the later commits are recorded beside it under `product/plans/complete/`. The claim hides the plan trail a reviewer needs to scope those repairs.

## Decision

Keep every section, heading, and paragraph in its current order. Change only the branch-statistics sentence in the Summary and the sentence after the canonical plan link in Source plan and subplans.

The statistics sentence is rewritten after the push with the committed count from `git rev-list --count 139aaf43..HEAD` and the changed-file count from `git diff --name-only 139aaf43...HEAD`, so it includes this bookkeeping commit.

The "only plan" sentence is replaced with a durable inventory: the canonical plan is linked, and focused repair plans are described as recorded beside it under `product/plans/complete/`, each named for the repair it scopes. It does not enumerate the repair plans, so a later repair plan does not invalidate it. The canonical plan's existing link stays as the author wrote it.

## Changes

### Pull request body, applied after the push

- Summary: the sentence about commits and changed files reports the counts recomputed at the pushed head.
- Source plan and subplans: the sentence claiming the canonical plan is the branch's only plan is replaced by the durable inventory described in the Decision. The canonical plan bullet is unchanged.

### Backlog

- `product/backlog/pull-request.md`: the first entry is removed whole, from its lead `*` bullet through its `Proposal` paragraph, with the separating blank lines. The remaining entries stay byte for byte.

### Plan

- This plan moves from `draft/` to `ready/` to `complete/`.

## Tests

None added. The change is to pull request text and to plan and backlog files, and it changes no behavior. Verification is a re-read of the rewritten body against `git rev-list --count 139aaf43..HEAD`, `git diff --name-only 139aaf43...HEAD`, and `ls product/plans/complete/`, plus a check that no sentence still calls the canonical plan the branch's only plan. `check-diff` gates the change.

## Spec

No spec file changes. The description restates branch bookkeeping rather than behavior, and the behavior specs are unaffected.

## Docs

None needed. No help page or user documentation describes the pull request description or the plan inventory.

## Out of scope

- Any source, test, spec, or documentation change.
- The pull request title.
- The rest of the body, including the Summary's feature description, Verification, manual acceptance status, and How to verify.
- Every plan file other than this one.
- `product/backlog/issues.md`.
