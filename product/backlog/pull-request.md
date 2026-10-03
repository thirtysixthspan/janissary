<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Remove the unused history-walk helper whose test passes without the shipped code ever calling it.

Existing Issue: `recallLine` is exported from `web/src/plugins/shell/command-line-rules.ts` and referenced only by its own test file, while the walk the tab actually performs is the one `useCommandBarKeys` does from its `history` prop. Severity: 3/10

Existing Risk: 4/10 - The plan names the history walk as one of the pure functions in that module, and a test named for that walk's edge cases passes against a function nothing calls, so a change to the real recall in `useCommandBarKeys` would be reported as covered when it is not.

Proposal Risk: 1/10 - Deleting dead code and its test cannot change behavior, and the recall the user sees is untouched.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: drop the shell plugin's unused recallLine helper". Delete `recallLine` from `web/src/plugins/shell/command-line-rules.ts` and its cases from `web/src/plugins/shell/command-line-rules.test.ts`, and correct the sentence in `product/plans/complete/shell-tab.md` that names the history walk among that module's pure functions, since the walk is the published `useCommandBarKeys` hook's. Check whether `CONTROL_KEYS` in the same module has an external consumer at all and narrow it to module scope if not. The remaining rules, `routeFor`, `shellLine` and `controlCharacterFor`, are used by `ShellTab` and their cases must keep passing untouched.

