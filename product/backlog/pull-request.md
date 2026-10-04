<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* the shell should show no command line

* Fix the functionality gap that routes docked-shell commands to the center tab.

Existing Issue: `AppCommandBar` classifies a bare close against the center `activeTab`, `useCmdW` closes `activeTabRef`, and the `agent` command reads `TabManager.cur()` instead of its supplied command context, while a docked shell can focus its own command bar without changing the center selection, so its close and agent actions target the center tab. Severity: 7/10

Existing Risk: 6/10 - A user trying to close a docked shell can close or prompt to close an unrelated center tab, while `agent` can launch from the center tab's directory and group instead of the shell's.

Proposal Risk: 2/10 - Routing each operation through the shell tab that received it preserves docked close semantics and source-relative agent creation; other global shortcuts still need their own target if they become tab-specific.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: target docked shell actions at the shell tab". Pass the plugin tab's label or focused surface into `web/src/shared/command-bar/AppCommandBar.tsx` so bare close classification and `CloseSaveGuard` use the shell tab, and update `web/src/useCmdW.ts` to resolve Cmd+W against the focused sidebar selection when a docked shell command bar has focus. Change `src/commands/agent.ts` and `src/profile/new-agent.ts` to use the `{ label, index }` command context supplied by `CommandManager.dispatchLine` rather than `TabManager.cur()`. Keep named `close <name>` behavior unchanged. Add tests with one center tab and a docked shell proving bare `close` and Cmd+W close the shell without opening the quit dialog or closing the center tab, and that `agent` uses the shell tab's context; retain the existing tests in `web/src/shared/command-bar/AppCommandBar.test.tsx` and `web/src/useCmdW.test.tsx`.
