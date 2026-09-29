# Test task reads its lifecycle instructions from the base branch

**Complexity: 2/10** — prose edits to one playbook and one spec, plus a small pin test; no application code.

## Goal

`ai/tasks/test-pull-request.md` treats everything on the tested branch as data, and it reaches scripts through `$janissary/scripts/run.mjs` for that reason. Even so, it tells the agent to execute the project's own copy of `start-application.md` and `stop-application.md`, and to follow `prepare-workspace.md` through a relative link. In this repository all three live under the branch's own `ai/tasks/workspace/`, so a pull request can rewrite the instructions its tester obeys. This fix makes the task read those instructions from the pull request's base branch, which the pull request cannot change.

## Approach

Step 0 records the pull request's `baseRefName` alongside its number, head branch, and URL. Step 2 fetches that base branch after checkout. Every workspace task the playbook follows is then read with `git show origin/<base>:ai/tasks/workspace/<file>.md`, and falls back to `$janissary/ai/tasks/workspace/<file>.md` when the base branch has no copy. The same applies to the project instructions the start task tells its reader to consult first (`AGENTS.md`, `CLAUDE.md`), which are read with `git show origin/<base>:<file>`. The opening untrusted-content paragraph says the branch's `AGENTS.md`, `CLAUDE.md`, and `ai/` files are data under test, and the sentence that routes scripts through the installation's runner gains the matching rationale for tasks.

A pull request that changes how its own app starts will be started the old way. It may fail to start, and that is reported like any start failure, which is the correct outcome for an instruction the tester cannot trust.

## Implementation steps

1. `ai/tasks/test-pull-request.md`: extend the opening paragraphs with the base-branch rule; add `baseRefName` to Step 0's `gh pr view` fields; add a `git fetch origin <base>` line to Step 2; rewrite Step 3's reference to `prepare-workspace.md`, Step 7's reference to `start-application.md`, and Step 11's reference to `stop-application.md` to use the base-branch read with the installation fallback.
2. `product/specs/pull-request-testing.md`: add one sentence stating that the run takes its build, start, and stop instructions from the base branch, never from the pull request under test.
3. `scripts/test-pull-request-playbook.test.mjs` (new): pin the rule.

## Tests

A new `scripts/test-pull-request-playbook.test.mjs`, in the shape of `scripts/find-bugs-playbook.test.mjs`, reads the playbook and asserts that each of `prepare-workspace.md`, `start-application.md`, and `stop-application.md` is named in its `git show origin/<base>:ai/tasks/workspace/<file>.md` form, that the playbook records `baseRefName`, and that it never tells the reader to use "the project's own copy" of a task. This pins the security property against a later edit that reintroduces the branch's copy.

## Out of scope

- The install command in Step 3 (a separate backlog entry).
- Session-ending steps (a separate backlog entry).
- Changing the workspace tasks themselves, or `find-bugs.md`, which tests a branch the human already trusts.
