# Correct the Screenshots connection-row model claim

**Complexity: 1/10** — description-prose-only correction: no production files, no code requirements, no new tests or units (p=1.578). The care is in rewriting one sentence while preserving every other character of the pull request body.

## Goal

Pull request 2170's "Screenshots" section says the user-visible effects include "the role-backed ACP connection row and its model in the editor's connections window". That is inaccurate: the connection row is plain text labelled `<persona> (acp)` with no model id (`connectionsFor` in `src/editor/acp-manager.ts`, pinned by `src/editor/acp-manager.test.ts`), and the model is a server-side fact carried by the monitor connection-info line in `src/monitor/session.ts` or the connection record. The corrected Behavior examples and How to verify steps 1 and 2 already say this. Correct only that one reason sentence in the pull request description so it agrees with them, without changing any code, tests, specs, help, or user documentation.

## Approach

This is a description-fidelity fix, not a code change. Record the fix plan and drain the backlog entry first, commit and push that change, then read the current body with `gh pr view 2170 --json body`, rewrite only the Screenshots reason sentence, write the full revised body to `./temp/pr-body.md`, and apply it with `gh pr edit 2170 --body-file ./temp/pr-body.md` after the push. Preserve every other character exactly — title, the corrected monitor tool-loop "What" sentence, Behavior examples, the additional test cases, How to verify steps 1–2, and all remaining sections. Leave the pull request open.

## Implementation steps

1. Record this plan in `product/plans/complete/` and remove the resolved entry from `product/backlog/pull-request.md`, restoring the master comment-and-heading skeleton when the file is drained.
2. Commit and push that change to `feature/persona-role-acp-pipeline`; verify the PR is still OPEN on the matching head before any description edit.
3. Read the current body with `gh pr view 2170 --json body` and locate the Screenshots reason sentence that begins "The user-visible effects are the persona file's first line".
4. Rewrite only that sentence so it names the role-backed connection row labelled `<persona> (acp)` and the notification lines, drops the claim that the row shows its model, and points the reader at the monitor connection-info line in `src/monitor/session.ts` or the connection record for the model — matching the Behavior examples and verify steps 1 and 2. Leave change-set statistics out of the corrected text.
5. Write the full revised body to `./temp/pr-body.md` and apply it with `gh pr edit 2170 --body-file ./temp/pr-body.md`. Do not touch the title. Confirm the PR is still OPEN and `headRefOid` matches `git rev-parse HEAD`.

## Tests

No new tests. `src/editor/acp-manager.test.ts` already pins the plain-text `<persona> (acp)` row text and needs no change. Verify by reading the corrected sentence against that test, `src/monitor/session.ts`, and the Behavior examples and verify steps 1 and 2.

## Out of scope

- Any edit to source, tests, specs, `help/`, or `documentation/`.
- Editing the pull request title or any section other than the Screenshots reason sentence.
- Editing any other backlog entry beyond the resolved one.
- Merging, closing, or force-pushing the pull request.

## Verification

- `$janissary/scripts/run.mjs check-diff` stays green.
- `git status --short` shows only the plan and the drained backlog file changed before the commit.
- `gh pr view 2170 --json body` shows only the named Screenshots reason sentence changed; the title, "What", Behavior examples, additional test cases, How to verify, and every other section are unchanged.
- The PR remains OPEN with `headRefOid` equal to `git rev-parse HEAD`.
