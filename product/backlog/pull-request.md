<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the new command help, user documentation, and fix-plan wording so the last-tab `quit` refusal is stated only when `quit` is disabled.

Existing Issue: help/commands.md, documentation/user-documentation/command-bar/commands.md, and product/plans/complete/correct-disabled-command-refusal-wording.md say closing the last tab from `Cmd+W`/`Ctrl+W` or the tab strip opens the quit confirmation first and the `quit` it dispatches is then refused, without saying that `quit` must be disabled, so a reader who disabled only `close` is told the last-tab close will be refused when confirming it actually quits. Severity: 3/10

Existing Risk: 3/10 - A user who disabled `close` and closes the last tab from the keyboard or tab strip confirms the quit dialog expecting a refusal and exits the application instead; the unsaved-work prompts still protect data, but the documented behavior is wrong.

Proposal Risk: 1/10 - Adding the condition makes the sentence match `help/close.md`, `help/quit.md`, and the code; no behavior changes.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "qualify the last-tab quit refusal in the command help and user documentation". In help/commands.md and documentation/user-documentation/command-bar/commands.md, change the final sentence to say that closing the last tab from `Cmd+W`/`Ctrl+W` or the tab strip still opens the quit confirmation first, and confirming dispatches `quit`, which the server refuses when `quit` is disabled; match the already-correct wording in help/close.md and help/quit.md. Update the Goal and Approach of product/plans/complete/correct-disabled-command-refusal-wording.md to carry the same condition so the completed plan matches the docs. No code or test changes; the behavior is pinned by the `closeQuitsApp` path in web/src/App.tsx and src/tab/placement.ts and the refusal in src/native-commands/dispatch-policy.ts. Run $janissary/scripts/run.mjs check-diff after the edits.
