<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* the shell should show no command line

* Close the security gap in plugin terminal attachment ownership.

Existing Issue: `createPluginClientCapabilities` installs `attachTerminal` for every plugin and passes its raw `ptyId` to `client.attachPty`, `ptyInput`, and `ptyResize`, while PTY ids are sequential and the server-side input and resize paths do not check which tab owns an id. Severity: 8/10

Existing Risk: 7/10 - A faulty plugin can guess another PTY id, observe a harness or SSH session's output, or inject keystrokes into a process it does not own.

Proposal Risk: 2/10 - A host-authorized attachment bound to the owning plugin tab prevents accidental cross-tab access; bundled plugin code still runs at host trust as documented.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: bind terminal attachment to its owning plugin tab". Replace the arbitrary-id path in `web/src/plugins/api.ts` with a host-authorized terminal handle tied to the requesting plugin tab, and enforce ownership for attachment, output delivery, input, and resize through `src/pseudoterminal-manager.ts`, `src/controller/tab-adapter.ts`, `src/message/handler.ts`, and `src/protocol/core-rpc.ts`. Do not treat the predictable `ptyN` identifier alone as authorization. Add tests proving a plugin can attach to and control its own spawned terminal but cannot observe, write to, or resize a terminal owned by another tab; retain the shell's existing byte, resize, and exit coverage in `web/src/plugins/shell/useShellTerminal.test.ts`.


* Deliver the plan's bare-word picker behavior from the shell command bar.

Existing Issue: The shared `AppCommandBar` invokes picker openers for shell-tab submissions, but `PickerOverlays` is rendered only for agent, editor, and harness bodies and is not rendered by `PluginTabLayer`, so commands such as `theme`, `hist`, and `tasks` set hidden picker state without displaying a picker. Severity: 7/10

Existing Risk: 7/10 - A shell-tab user gets no visible response to commands documented as opening a picker, while the window handler can route keys into the invisible modal state and the shell bar can still submit lines.

Proposal Risk: 2/10 - Rendering the application-owned picker for the active plugin tab and making the shell bar respect its modal state restores the interaction without duplicating picker behavior.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: render application pickers from plugin tabs". Pass the existing `PickerOverlays` and blocking state through `web/src/AppMain.tsx` and `web/src/MountedViewLayers.tsx` to the active plugin body in `web/src/plugins/PluginTabLayer.tsx` and `web/src/plugins/DockedPluginBody.tsx`, and have `web/src/plugins/shell/ShellTab.tsx` defer key handling and submission while an application picker is open. Reuse the existing picker components and handlers rather than adding shell-specific copies. Add an integration case showing that bare `theme` opens a visible picker in a shell tab, that its arrows and Return/Escape work, and that no line reaches the PTY; keep the agent-picker coverage in `web/src/shared/command-bar/AppCommandBar.test.tsx` passing.


* Fix the functionality gap that routes docked-shell commands to the center tab.

Existing Issue: `AppCommandBar` classifies a bare close against the center `activeTab`, `useCmdW` closes `activeTabRef`, and the `agent` command reads `TabManager.cur()` instead of its supplied command context, while a docked shell can focus its own command bar without changing the center selection, so its close and agent actions target the center tab. Severity: 7/10

Existing Risk: 6/10 - A user trying to close a docked shell can close or prompt to close an unrelated center tab, while `agent` can launch from the center tab's directory and group instead of the shell's.

Proposal Risk: 2/10 - Routing each operation through the shell tab that received it preserves docked close semantics and source-relative agent creation; other global shortcuts still need their own target if they become tab-specific.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: target docked shell actions at the shell tab". Pass the plugin tab's label or focused surface into `web/src/shared/command-bar/AppCommandBar.tsx` so bare close classification and `CloseSaveGuard` use the shell tab, and update `web/src/useCmdW.ts` to resolve Cmd+W against the focused sidebar selection when a docked shell command bar has focus. Change `src/commands/agent.ts` and `src/profile/new-agent.ts` to use the `{ label, index }` command context supplied by `CommandManager.dispatchLine` rather than `TabManager.cur()`. Keep named `close <name>` behavior unchanged. Add tests with one center tab and a docked shell proving bare `close` and Cmd+W close the shell without opening the quit dialog or closing the center tab, and that `agent` uses the shell tab's context; retain the existing tests in `web/src/shared/command-bar/AppCommandBar.test.tsx` and `web/src/useCmdW.test.tsx`.
