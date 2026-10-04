<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* in the shell tab, ctrl+g should trigger and show the tab nav 

* ghost text should be supported in the command bar of the shell tab

* Close the security gap caused by losing a shell tab's workspace ownership.

* the shell should show no command line

* the metadata bar should show the current working directory of the shell

* the history picker triggered by ctrl+r in teh shell tab should be styled and use the same key input as the history picker in the agent tab.

* the clipboard-history popup should work in the shell tab just as in the agent tab.

* the queue popup should work in the shell tab just as in the agent tab.

* the task picker popup should work in the shell tab just as in the agent tab.

* cmd+t should open a new zsh in the same working directory without creating a new workspace

* cmd+p should open the Quick Open file finder in the shell tab just as in the agent tab.

* shift + tab should move the keyboard focus between the terminal and the command bar. the keyboard focus will determine where keypresses are sent in the shell tab.

* paste from keyboard in the context menu in the command bar open the clipboard-history popup and past into the command bar

* in the shell tab, open file navigator here button in the metadata tab should open a file navigator in the current working directory of the shell

* in the shell tab, plus button in the metadata tab should open a new shell tab in the current working directory of the current shell

* typing `theme` into the zsh tab should launch the theme picker popup.

* the dot color in the command bar should the same color at the tab dot.

* in the shell tab, teh clear command should be sent to the terminal







Existing Issue: `openShellTab` stores the source cwd and workspace only in `ShellPayload`, while `makePluginTab` leaves the server `Tab` without `runtime.cwd` or `workspaceDir` and the shell takes no workspace reference, so host actions fall back to project or process defaults and closing the source can remove the clone under the live shell. Severity: 9/10

Existing Risk: 9/10 - A click on `New agent in this workspace` can launch an unconfined agent, a nested `zsh` loses the Seatbelt workspace, and closing the source agent can recursively remove uncommitted workspace files while the shell still uses them.

Proposal Risk: 2/10 - A host-owned cwd and workspace reference keeps follow-on actions and shells in the intended clone until its final tab closes; the deliberate unconfined behavior of a non-workspaced shell remains.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: preserve shell-tab workspace ownership and context". In `src/tab/openers.ts`, `src/tab/creators.ts`, and `src/tab/index.ts`, retain the source tab's host-owned cwd, workspace directory, and offline setting on a shell tab when its factory starts a terminal, and retain the workspace through `WorkspaceManager.retain`; let the existing release in `src/tab/cleanup.ts` drop that reference when the shell tab closes. Make `originTab` and `completeLine` in `src/plugins/line-capabilities.ts`, plus the metadata-row actions in `src/file-navigator/open.ts` and `src/profile/manager.ts`, resolve against that server-owned state so nested `zsh`, completion, file navigation, and agent creation use the shell's actual directory and confinement. Do not use `ShellPayload.cwd` or `ShellPayload.workspace` as authority for sandboxing. Add regression coverage that a shell opened from a workspaced agent keeps the clone after the source closes, that a nested shell inherits the workspace and offline mode, and that the file-navigator and new-agent actions use the shell's context; preserve the existing coverage in `src/plugins/shell/activate.test.ts`, `src/tab/manager.test.ts`, and `src/controller.test.ts`.


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


* Fix the functionality gap when multiple visible plugin tabs claim the same chord.

Existing Issue: `createPluginChordRegistry` stores claims under only `pluginId` and chord, so two visible shell tabs overwrite each other's handler and either tab's cleanup deletes the shared entry, making Ctrl+R open the wrong shell's history or stop working. Severity: 6/10

Existing Risk: 6/10 - A shell selected in a sidebar can steal Ctrl+R from a focused shell elsewhere, and hiding either one can remove the remaining visible shell's claim.

Proposal Risk: 2/10 - Tab-scoped registrations and a deterministic focused-tab resolution prevent one shell from replacing or releasing another's handler, while the application still receives unclaimed chords.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: keep simultaneous plugin chord claims per tab". Change the registration identity and cleanup closure in `web/src/plugins/PluginChords.tsx` to include the tab label, and resolve a chord against the tab that currently owns keyboard focus rather than the first registry entry. Add a regression with two shell tabs visible in different surfaces: Ctrl+R must open the focused tab's history, hiding the other tab must not clear the remaining registration, and releasing both must hand Ctrl+R back to the application. Keep the existing shell chord cases in `web/src/plugins/shell/ShellTab.test.tsx` and `web/src/useWindowKeys.test.ts` passing.

