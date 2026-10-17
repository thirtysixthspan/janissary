<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Add the focused status-hook test required by the plan for generation-bound mount-time exit reports.

Existing Issue: The plan calls for `web/src/plugins/shell/useShellTerminalStatus.test.ts`, but the commit adds no test for the hook itself and exercises only a subset of its generation behavior through `ShellTab.test.tsx`. Severity: 5/10

Existing Risk: 5/10 - Future changes to status-request cancellation, echoed-generation matching, or false-running handling can regress the stale-attachment boundary without a focused test identifying which hook behavior broke.

Proposal Risk: 2/10 - Direct hook coverage pins the request and response contract while the existing `ShellTab` integration assertions continue to cover the user-visible close behavior.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1729 "add focused tests for the shell terminal status hook". Add `web/src/plugins/shell/useShellTerminalStatus.test.ts` for `useShellTerminalStatus`, asserting that it requests status with the captured PTY id, closes only when the response echoes that id with `running: false`, ignores a mismatched generation and a cancelled response, and reports a rejected intent only while mounted. Keep `web/src/plugins/shell/ShellTab.test.tsx`'s integration coverage for closing an exited shell and ignoring a replacement-generation response. No existing hook-level test currently covers these transitions.
