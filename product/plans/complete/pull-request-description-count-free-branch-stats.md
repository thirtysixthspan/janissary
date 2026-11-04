# Pull request description states the branch scope without moving counts

**Complexity: 2/10** — a description correction. No source, test, spec, or documentation file changes. The only edits are to this plan and the pull request backlog, and to the body of pull request #1916, which is applied after the push.

## Goal

Make the body of pull request #1916 stop reporting commit and changed-file counts that go stale as the branch advances, while keeping its statement of what the branch carries. The title and every other paragraph stay as they are.

## Problem

The Summary says "As of this head the branch carries 102 commits and 287 changed files from `139aaf43`." At the current head the same commands report 105 commits and 292 changed files, and every later commit changes both figures again. The previous repair recomputed the numbers, so the same correction recurs on the next commit. The body needs a sentence whose truth does not depend on the head.

## Decision

Replace only that one sentence in the Summary with a count-free sentence that keeps the base commit and the branch-scope description. The replacement is:

> This branch builds on `139aaf43` and carries the feature work described below.

The sentence after it, "That includes the server record store and feeds, …", already lists the branch's contents and stays unchanged. No count is stated anywhere in the replacement, so no later commit can invalidate it.

Leave the Summary's opening feature paragraph, the Source plan and subplans section and its durable repair-plan inventory, and the rest of the description exactly as written.

## Changes

### Pull request body, applied after the push

- Summary: the sentence reporting 102 commits and 287 changed files from `139aaf43` is replaced by the count-free sentence in the Decision.
- Every other paragraph, section, and heading stays as the author wrote it.

### Backlog

- `product/backlog/pull-request.md`: the entry is removed whole, from its lead `*` bullet through its `Proposal` paragraph, with the separating blank lines. No entries remain, so the file is restored to its comment-and-heading skeleton.

### Plan

- This plan moves from `draft/` to `ready/` to `complete/`.

## Tests

None added. The change is to pull request text and to plan and backlog files, and it changes no behavior. Verification is a re-read of the rewritten Summary confirming it states no commit or changed-file count while still naming `139aaf43` and the branch's feature scope, plus a check that the Source plan and subplans section is unchanged. `check-diff` gates the change.

## Spec

No spec file changes. The description restates branch bookkeeping rather than behavior, and the behavior specs are unaffected.

## Docs

None needed. No help page or user documentation describes the pull request description.

## Out of scope

- Any source, test, spec, or documentation change.
- The pull request title.
- The rest of the body, including the Summary's feature description, the Source plan and subplans inventory, Verification, manual acceptance status, and How to verify.
- Every plan file other than this one.
- `product/backlog/issues.md`.
