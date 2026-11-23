# Remove the stale behavior-spec count from the pull request description

**Complexity: 1/10** — description-only edit with no production files and no added lines, 4 acceptance requirements (p=2.71).

## Goal

Pull request 2185's description says "The six behavior specs were reconciled with this routing" while the parenthetical list that follows names seven files (`acp.md`, `acp-records.md`, `connection.md`, `connections-tab.md`, `editor-tab.md`, `monitoring.md`, `roles.md`), and the aggregate diff changes all seven `product/specs/` files. The number came from an earlier ready plan that named six, before `acp-records.md` was added. A reviewer who trusts the count can miscount the reconciliation scope and overlook `acp-records.md`. The goal is to drop the stale count from that one sentence, keeping the enumerated file list and every other word of the description exactly as the author wrote it.

## Requirements

1. The sentence "The six behavior specs were reconciled with this routing (...)" drops the stale count "six" and becomes "The behavior specs were reconciled with this routing (...)" — the wrong count is removed, not replaced with seven. From the entry's Proposal: "Edit only that sentence of the pull request body to drop the count, for example 'The behavior specs were reconciled with this routing (...)'" and "Per the change-set-statistic rule, remove the wrong count rather than replacing it with seven."
2. The parenthesized file list stays exactly as written. From the entry's Proposal: "leaving the parenthesized file list exactly as written".
3. Every other paragraph of the description, the title, all source files, and all specs stay byte-for-byte unchanged. From the entry's Proposal: "and every other paragraph byte-for-byte unchanged. Do not change the title, any source file, spec, or any other description text."
4. The corrected live body has no "six behavior specs" wording, and the pull request is still OPEN with its head matching the local HEAD. From the entry's Proposal: "Verify with gh pr view 2185 --json body that no 'six behavior specs' wording remains, that the file list and all other paragraphs are intact, and that the pull request is still OPEN."

## Design decisions

- Change only the one sentence in the pull request body that carries the count; this is a description correction, so no source, test, help page, spec, or documentation-tree file is edited.
- Remove the number rather than updating it to seven: change-set statistics belong to GitHub's own diff, so a stale statistic is deleted, not kept current, and the following file list carries the scope on its own.
- Keep the parenthesized file list and every other paragraph byte-for-byte; `gh pr edit` replaces the body wholesale, so preservation is the editor's responsibility, not the tool's.
- Apply the description edit after the commit and push succeed, per the task's publication ordering, so a live GitHub artifact is never ahead of the content on its branch.
- Read the current body with `gh pr view <reference> --json body`, write the full revised body to `./temp/pr-body.md`, and apply it with `gh pr edit <reference> --body-file ./temp/pr-body.md`; `temp/` is gitignored so the scratch file cannot reach a commit.
- Leave the pull request title untouched and leave the pull request open; never merge, close, or replace it.

## Preserved behavior

None found. The change edits pull-request description prose only; no application behavior is touched.

## Assumptions

1. Pull request 2185 is OPEN with head branch `feat/ai-personas-role-acp-pipeline` — `gh pr view 2185 --json number,state,headRefName,url` returned `"state":"OPEN"`.
2. The body contains the sentence "The six behavior specs were reconciled with this routing (`product/specs/acp.md`, `acp-records.md`, `connection.md`, `connections-tab.md`, `editor-tab.md`, `monitoring.md`, `roles.md`)." — `gh pr view 2185 --json body`.
3. The parenthetical list names seven files and `git diff --name-only master...HEAD -- product/specs/` lists exactly those same seven files, confirming the count is the stale part, not the list.
4. The entry is the sole remaining entry in `./product/backlog/pull-request.md`, so removing it drains the backlog and requires restoring the exact comment-and-heading skeleton.
5. The orchestrator overrides the complexity-7 cutoff for this entry; its recorded severity is 2/10.

## Existing functionality

1. `gh pr view <reference> --json body` reads the current live description, using the same CLI the task already relies on for state checks.
2. `gh pr edit <reference> --body-file ./temp/pr-body.md` is the GitHub CLI route for replacing a description from a file, avoiding the shell-quoting failure of an inline multi-line `--body` string; this is the pattern `scripts/pr-create-pr.sh` and `merge-change-to-master.md` already use.
3. `./temp/` is gitignored, so the scratch body file cannot reach a commit.
4. The backlog entry's `Proposal` in `./product/backlog/pull-request.md` supplies the authorized wording and verification steps.
5. `$janissary/scripts/run.mjs check-diff` is the available diff-scoped verification command.

## Implementation steps

1. Record this fix plan under `./product/plans/` (draft, then rated, then ready, then complete) with its complexity line; no application code is involved. Run `$janissary/scripts/run.mjs check-diff` after recording it.
2. Remove the resolved entry whole from `./product/backlog/pull-request.md`, from its lead `*` bullet through its `Proposal` paragraph and separating blank lines. Because it is the only entry, rewrite the file to the exact master skeleton: the leading comment, a blank line, and `# pull-request`. Run `$janissary/scripts/run.mjs check-diff` after the edit.
3. Commit the plan file and backlog removal to the recorded head branch with `$janissary/scripts/run.mjs pr-commit` and push with `git push`, leaving the pull request open.
4. After the push succeeds, read the current body with `gh pr view 2185 --json body`, change only the sentence "The six behavior specs were reconciled with this routing (...)" to "The behavior specs were reconciled with this routing (...)", write the full revised body to `./temp/pr-body.md`, and apply it with `gh pr edit 2185 --body-file ./temp/pr-body.md`. Do not pass `--title` or any other metadata flag.
5. Confirm the body with `gh pr view 2185 --json body` and confirm the pull request is still OPEN with a head matching `git rev-parse HEAD` using `gh pr view 2185 --json state,headRefName,headRefOid,url`.

## UI design

None. This is a pull-request description correction; it changes no command, flag, key binding, or user interface.

## Tests

No new tests. The fix changes only the pull request's description plus a plan file and a backlog entry; no application behavior is changed and no code is introduced, so there is nothing to test. The task forbids inventing tests that cover nothing.

## Out of scope

- Editing any source file, test, spec, help page, or the `documentation/user-documentation/` and `documentation/developer-documentation/` trees.
- Editing any other paragraph of the pull request description or the pull request title; both stay byte-for-byte as the author wrote them.
- Replacing the wrong count with seven; the count is removed, not updated.
- Merging, closing, or replacing pull request 2185.

## Verification

`$janissary/scripts/run.mjs check-diff` after each editing step — expected to exit 0 with no lint, typecheck, or test regression, since only markdown changed.

Then, concrete read-based checks: `gh pr view 2185 --json body` must return the description with "The six behavior specs were reconciled with this routing" changed to "The behavior specs were reconciled with this routing", with the parenthetical file list exactly as written and every other paragraph byte-for-byte intact; the string "six behavior specs" must not appear. Read `./product/backlog/pull-request.md` and confirm it holds only the leading comment, a blank line, and `# pull-request`. Read this plan in `./product/plans/complete/` and confirm it records the description correction. Finally `gh pr view 2185 --json state,headRefName,headRefOid,url` must show state OPEN and a `headRefOid` equal to `git rev-parse HEAD`.
