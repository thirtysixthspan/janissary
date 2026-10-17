<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's terminal-attachment gate before queued shell dispatch.

Existing Issue: The queue can dequeue a shell-directed row while `attachTerminal` is still pending, and `useShellTerminal.write` silently drops it while `handleRef` is null. Severity: 7/10

Existing Risk: 7/10 - A delayed terminal attachment can lose queued shell commands and leave the FIFO waiting for a prompt that will never arrive.

Proposal Risk: 2/10 - Waiting for attachment before dequeueing keeps commands stored until zsh can receive them, with the remaining risk limited to an attachment that never resolves.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1729 "wait for terminal attachment before draining queued shell commands". In `web/src/plugins/shell/useShellTerminal.ts`, expose an attachment-ready signal that becomes true only after `onAttached` has installed the terminal handle, and false during cleanup or a PTY-generation change. In `web/src/plugins/shell/ShellTab.tsx` and `web/src/plugins/shell/useShellCommandQueue.ts`, keep the existing FIFO busy until that signal is true and wake it when attachment completes, so no stored shell row can be dequeued before `write` reaches an attached terminal; application-routed rows may also wait, which preserves FIFO ordering. Add an integration case to `web/src/plugins/shell/useShellCommandQueue.test.tsx` or `web/src/plugins/shell/ShellTab.test.tsx` using a deferred `attachTerminal` promise and a queued shell command: assert no dequeue/write occurs before resolution, then assert the command is written once and the queue continues after the prompt. The existing tests cover provisioning readiness and receipt disposal but do not cover a terminal payload whose attachment is pending.
