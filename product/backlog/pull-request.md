<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the plan's own contradiction about `disableStdin`, which it lists as out of scope in one section and describes as shipped in another.

Existing Issue: `product/plans/complete/shell-tab.md` states that `disableStdin` was considered and not chosen and lists "no `disableStdin`" under Out of scope, while its client section describes the terminal as created with stdin disabled, which is what `web/src/plugins/shell/useShellTerminal.ts` does. Severity: 3/10

Existing Risk: 3/10 - The plan is the record a later reader trusts about why the terminal refuses input, and as written it both forbids and requires the shipped line, so the next person to read it cannot tell which was decided.

Proposal Risk: 1/10 - Only prose changes, and the recorded user answer already describes what the code does.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: reconcile the plan's disableStdin decision with the shipped terminal". In `product/plans/complete/shell-tab.md`, settle the contradiction in favour of what ships: state in the design decisions that the terminal is never focused *and* is built with stdin disabled as the structural half of the same rule, and replace the "no `disableStdin`" clause in the Out of scope entry with the click-to-type path that is genuinely out of scope. Keep the reasoning already at the point of enforcement in `web/src/plugins/shell/useShellTerminal.ts`. Check `product/specs/shell-tab.md` for the same claim in user-facing wording and correct it there too if it describes the terminal as merely unfocused, and re-read the pull request description, whose Verification section repeats the manual check for this behavior.


* Remove the unused history-walk helper whose test passes without the shipped code ever calling it.

Existing Issue: `recallLine` is exported from `web/src/plugins/shell/command-line-rules.ts` and referenced only by its own test file, while the walk the tab actually performs is the one `useCommandBarKeys` does from its `history` prop. Severity: 3/10

Existing Risk: 4/10 - The plan names the history walk as one of the pure functions in that module, and a test named for that walk's edge cases passes against a function nothing calls, so a change to the real recall in `useCommandBarKeys` would be reported as covered when it is not.

Proposal Risk: 1/10 - Deleting dead code and its test cannot change behavior, and the recall the user sees is untouched.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: drop the shell plugin's unused recallLine helper". Delete `recallLine` from `web/src/plugins/shell/command-line-rules.ts` and its cases from `web/src/plugins/shell/command-line-rules.test.ts`, and correct the sentence in `product/plans/complete/shell-tab.md` that names the history walk among that module's pure functions, since the walk is the published `useCommandBarKeys` hook's. Check whether `CONTROL_KEYS` in the same module has an external consumer at all and narrow it to module scope if not. The remaining rules, `routeFor`, `shellLine` and `controlCharacterFor`, are used by `ShellTab` and their cases must keep passing untouched.

