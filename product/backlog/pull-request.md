<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description's claim that the current change contains plans only, because this commit implements generation-bound shell exit handling.

Existing Issue: The pull request body says the current diff consists of thirteen draft plans and that implementation is pending, while commit `ed223846` changes server, client, spec, and documentation files to implement client-reported shell exit generations. Severity: 7/10

Existing Risk: 5/10 - Reviewers may rely on the plans-only statement and miss that this commit changes close behavior and the RPC/plugin contracts.

Proposal Risk: 2/10 - A description that acknowledges the implementation commit makes the scope clear, though it cannot replace reviewing the code against its plan.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1729 "correct the PR description's plans-only claim for the shell exit generation implementation". Update the PR body so it identifies commit `ed223846` as the implementation of `system-schedules-05-system-shell-exit-generation-client-contract.md`, summarizes the generation-bound close/status behavior, and distinguishes this commit from the broader plans-only publication description where appropriate. Keep the plan link and the existing acceptance claims precise; do not imply that unrelated system-schedule behavior is implemented by this commit.


* Deliver the planned API-v2 changelog entry for the optional terminal-exit close argument.

Existing Issue: The contract prose above the API changelog documents the optional `close` argument, but the API v2 changelog itself has no entry for it. Severity: 4/10

Existing Risk: 4/10 - A reader consulting the version history can miss this published client-contract change and later misjudge compatibility or the API's evolution.

Proposal Risk: 1/10 - A concise additive v2 changelog entry records the contract change without suggesting an API integer increment.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1729 "add the terminal-exit close argument to the API v2 changelog". In `documentation/developer-documentation/tab-plugins.md` under `## API changelog` and `### v2`, add an entry stating that `close` accepts optional `{ terminalExited: ptyId }` for verified terminal exits, that this is additive and leaves `TAB_PLUGIN_API_VERSION` unchanged, and that zero-argument close remains ordinary user close. Keep the entry consistent with the existing client-contract paragraph and `product/specs/tab-plugins.md`.


* Add the focused status-hook test required by the plan for generation-bound mount-time exit reports.

Existing Issue: The plan calls for `web/src/plugins/shell/useShellTerminalStatus.test.ts`, but the commit adds no test for the hook itself and exercises only a subset of its generation behavior through `ShellTab.test.tsx`. Severity: 5/10

Existing Risk: 5/10 - Future changes to status-request cancellation, echoed-generation matching, or false-running handling can regress the stale-attachment boundary without a focused test identifying which hook behavior broke.

Proposal Risk: 2/10 - Direct hook coverage pins the request and response contract while the existing `ShellTab` integration assertions continue to cover the user-visible close behavior.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1729 "add focused tests for the shell terminal status hook". Add `web/src/plugins/shell/useShellTerminalStatus.test.ts` for `useShellTerminalStatus`, asserting that it requests status with the captured PTY id, closes only when the response echoes that id with `running: false`, ignores a mismatched generation and a cancelled response, and reports a rejected intent only while mounted. Keep `web/src/plugins/shell/ShellTab.test.tsx`'s integration coverage for closing an exited shell and ignoring a replacement-generation response. No existing hook-level test currently covers these transitions.
