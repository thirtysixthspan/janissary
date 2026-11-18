# Retitle pull request 2064 to reflect the delivered subagent feature

**Complexity: 1/10** — no production code (0 lines added, 0 files edited); one Conventional Commits title correction with a single read-back verification (p=2.32).

## Goal

PR #2064 is titled "docs(subagent): decompose implementation plan", which frames a large feature as a documentation-only change. The diff actually implements the entire `subagent` command: the command and its grammar, synchronous launch with durable records and immediate receipts, asynchronous delivery of queued messages and human replies, and a remote run-clone lifecycle. A reader judging scope from the title expects a docs-only edit and gives the change the wrong level of scrutiny.

The fix is to replace the title with a Conventional Commits subject that accurately names the delivered feature. The body already describes the implementation accurately and must be left byte-for-byte untouched.

## Approach

The remedy is a GitHub metadata change, not a source change: `gh pr edit <url> --title "<new title>"` against the pull request's canonical URL. The title follows Conventional Commits (`feat(subagent): ...`) and names the command, its asynchronous delivery, and its remote run clones — the three themes the PR body leads with.

As with any entry recorded in this PR's backlog, the fix still produces a commit: the fix plan goes to `./product/plans/complete/` and the resolved entry is removed from `./product/backlog/pull-request.md`, leaving the other entry untouched. The title edit is applied after the push, following the same live-artifact sequencing the repo uses for description corrections, so a failed push cannot leave the pull request retitled before the bookkeeping that justifies the change is on its branch. Verification is a read-back with `gh pr view <url> --json title`; the body and the open state are confirmed unchanged.

## Implementation steps

1. Write this fix plan to `./product/plans/draft/`, rate it with `ai/tasks/planning/rate-plan-complexity-quantitative.md` (Steps 2-6), and move it through `./product/plans/ready/` to `./product/plans/complete/`.
2. Remove only the first entry from `./product/backlog/pull-request.md` — the "Correct the pull request title..." entry, from its lead `*` bullet through its `Proposal` paragraph — leaving the "Reconcile the stale native-command counts..." entry byte-for-byte unchanged.
3. Confirm the PR is still OPEN and the current branch is its recorded head, then commit the plan and backlog changes with `./scripts/run.mjs pr-commit` and push with `git push`. Do not rewrite history.
4. After the push succeeds, apply the title: `gh pr edit <url> --title "feat(subagent): add the subagent command with asynchronous delivery and remote run clones"`.
5. Verify with `gh pr view <url> --json title` that the new title is in place, confirm the body is unchanged, and confirm the PR is still OPEN with a `headRefOid` matching `git rev-parse HEAD`.

## Tests

No automated tests. The change edits GitHub metadata and two product markdown files; there is no production code and no test surface, so `check-diff` is expected to report nothing scoped to this docs-only change. Verification is the read-back in step 5, plus confirming the body and open state are unchanged.

## Out of scope

- Changing the pull request body; it already describes the implementation accurately.
- Any source, test, spec, help, or user-documentation change — no behavior changes, and the stale native-command counts belong to a separate backlog entry that stays untouched.
- Merging, closing, or replacing the pull request, or force-pushing.
- The second backlog entry.
