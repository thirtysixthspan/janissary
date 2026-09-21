# technical-debt

## ready

* Extract remote-entry creation and frame/transport wiring from the remote lifecycle manager.

Existing Debt: `RemoteManager` in `src/remote/manager.ts` is 274 lines and combines the entry-table lifecycle with deferred PTY construction, handshake/frame dispatch, reconnect generation guards, readiness promises, and callback routing in one `create` method, exceeding the project's focused-module size guideline. Severity: 6/10

Existing Risk: 5/10 - Changes to provisioning or attach frames must modify a closure-heavy method beside shared-owner release and shutdown logic, making it easy to bind a callback to the wrong entry or alter teardown while changing only transport setup.

Proposal Risk: 3/10 - Remote setup still has mutually dependent channel and transport objects, so the extracted factory must retain its explicit deferred ownership and lifecycle callbacks to avoid hiding those ordering constraints.

Proposal: Move the construction pipeline from `RemoteManager.create` in `src/remote/manager.ts` into a focused `src/remote/` entry-factory module that creates the `RemoteChannel`, owns the deferred session/ready promise and generation guard, and returns the completed `RemoteEntry` plus its channel. Give that factory a narrow port for the manager-owned effects it needs: reporting a channel close against the exact entry and announcing session changes; keep the `entries` map, attach/release/detach/close operations, and their public API on `RemoteManager`, leaving `create` as the small registration and delegation path. Preserve the exported `RemoteLaunchHandlers` and `remoteServeCommand` surface used by `src/remote/manager.test.ts`, and keep its shared-channel, creator-label-reuse, attach, detach, and browser-exit cases passing because they cover the callback identity and lifecycle ordering the extraction must not change.


* Replace the file navigator drag hook's legacy positional overload with one named options contract.

Existing Debt: `web/src/file-navigator/useFileNavigatorDrag.ts` accepts two incompatible positional call shapes, detects the old one at runtime with string-versus-ref checks, and carries nine ordered parameters plus compatibility casts although `web/src/file-navigator/FileNavigatorTab.tsx` is the sole production caller and uses the newer shape. Severity: 5/10

Existing Risk: 5/10 - Adding a drag destination or changing root handling can silently bind a reference or path to the wrong positional slot, leaving a drop target unresponsive or causing a file move to use the wrong relative-path context without a type error at the call site.

Proposal Risk: 2/10 - The hook still coordinates several drop destinations and global gesture listeners, so regressions remain possible in destination-specific behavior, but named fields make omitted or misrouted inputs visible to TypeScript and reviewers.

Proposal: Define a named options type beside `useFileNavigatorDrag` in `web/src/file-navigator/useFileNavigatorDrag.ts` for `absoluteRoot`, `displayRoot`, `targetCwd`, command-bar and editor refs, and optional remote host; remove the `legacy` branch, union parameters, defaults that masquerade as old-call support, and the compatibility cast. Update `web/src/file-navigator/FileNavigatorTab.tsx` to pass that object, then convert the direct hook construction in `web/src/file-navigator/useFileNavigatorDrag.test.ts` through a small fixture or explicit options objects so each test states the inputs it depends on. Preserve the tests for ordinary moves, command-bar/editor/harness drops, remote path formatting, conflict flow, and mouse-up/blur/Escape/unmount cleanup, since those cover the behavior that must remain unchanged while the call boundary changes.

* Move the three flat `src/message-handler*.ts` files into `src/message/`: `message-handler.ts`, `message-handler-file-navigator.ts`, and `message-handler-plugin.ts` dispatch the server's RPC messages and have three colocated tests, with no bare `src/message.ts` entry. `src/message/` does not exist yet, no configuration names the old paths literally, and roughly five other files import the group, so this is a mechanical move and import rewrite. Resolve by running the `ai/tasks/hygiene/improve-namespacing.md` task against the `message` prefix. Severity: **low**.

* Move the three flat interactive-command files into `src/interactive/`: `interactive.ts`, `interactive-learned.ts`, and `interactive-signals.ts` classify terminal-taking commands, persist learned classifications, and detect terminal takeover, with three colocated tests and a bare `src/interactive.ts` entry that becomes `index.ts`. `src/interactive/` does not exist yet, no configuration names the old paths literally, and roughly six other files import the group, so its shared concern should live in the tree instead of in repeated filenames. Resolve by running the `ai/tasks/hygiene/improve-namespacing.md` task against the `interactive` prefix. Severity: **low**.

* Move the three flat notifications-feed files into `src/notifications/`: `notifications.ts`, `notifications-tab.ts`, and `notifications-tab-test-fixture.ts` own event eligibility, the singleton feed tab, and its test host, with two colocated tests and a bare `src/notifications.ts` entry that becomes `index.ts`. `src/notifications/` does not exist yet, no configuration names the old paths literally, and roughly twenty-five files across `src/` and `web/src/` import the group, so the one concern is currently discoverable only through a filename prefix. Resolve by running the `ai/tasks/hygiene/improve-namespacing.md` task against the `notifications` prefix. Severity: **low**.

## development

* Move the editor tab's commit-to-origin, rename, and resync protocol sequences into a plain module beside the component so the commit choreography is testable without rendering the editor.

Existing Debt: §5 (components render, they do not decide) — `web/src/editor/EditorTab.tsx` composes the commit-to-origin sequence in its body (save first via `saveRef`, then `client.commitEditorFile`, with failures swallowed because a save error is already on screen in the metadata row), plus the rename-and-refocus handler `commitEditorName` and the resync send written inline in the JSX's `onSyncClick`, so the tab's protocol rules live in the same file as its markup. Severity: 6/10

Existing Risk: 5/10 - The ordering rule (the save must land before the commit arms server-side, and a failed save suppresses it) is pinned only through a rendered interaction test, so every change in this actively growing commit/push area re-derives it by eye and a slip arms a commit over content that never got written.

Proposal Risk: 2/10 - The sequence becomes plain functions callable and testable directly, but the transcription is behavior-preserving by eye: the render tests pin the happy path, so a slip in the swallow-on-save-failure branch would surface only through a rendered commit.

Proposal: `web/src/editor/EditorTab.tsx` holds three protocol intents in its body. Extract them into a new `web/src/editor/editor-file-commands.ts` as plain functions taking the injected `JanusClient` and the pieces they need — a commit-after-save function carrying the ordering and its failure swallowing, the rename-and-refocus intent for the metadata row, and a resync sender — and have the component call them in place of the inline blocks. Scope the edit to `web/src/editor/EditorTab.tsx` plus the new module: the component's props, `web/src/editor/EditorMetaRow.tsx`'s contract, and every import path stay as they are. `web/src/editor/EditorTab.test.tsx` (the rename, commit-to-origin, and resync cases around its `makeClient` stub) needs no edit and must keep passing. Resolve by running the `ai/tasks/hygiene/improve-modularity.md` task against `web/src/editor/EditorTab.tsx`.


* Move the command bar's server-completion request out of the agent tab body into the command-input feature where the rest of the completion rules live.

Existing Debt: §5 (components render, they do not decide) — `web/src/agent-tabs/AgentTabBody.tsx` builds the completion request inline in the JSX it hands `CommandArea` (`complete={async (text, cursor) => { const result = await client.request<CompletionResult>({ method: 'complete', ... }); return result.ok ? result.value : undefined; }}`), so the request shape and the failed-result unwrap live inside the component body. Severity: 4/10

Existing Risk: 4/10 - The unwrap semantics (an `ok: false` result silently completes with nothing) exist nowhere but inside a rendered callback, so a change to the completion contract — caching, aborting a stale request — starts life as JSX in the app's most-churned component, and a regression is a broken typeahead in every agent tab.

Proposal Risk: 2/10 - The request becomes a directly callable function a unit test can pin, but nothing pins the current unwrap until such a test is written, so a transcription slip would land unnoticed until a rendered completion misbehaved.

Proposal: `web/src/agent-tabs/AgentTabBody.tsx` inlines the server completion call. Extract it into a new module beside the command-input feature's existing completion logic — `web/src/agent-tabs/command-input/server-completion.ts` exporting a `completeOnServer(client, text, cursor)` that returns the unwrapped result — and pass `complete={(text, cursor) => completeOnServer(client, text, cursor)}` from the component. Scope the edit to `web/src/agent-tabs/AgentTabBody.tsx` plus the new module: `web/src/agent-tabs/command-input/CommandInput.tsx` keeps its `complete` prop contract, so no other import changes. `web/src/agent-tabs/command-input/CommandInput.test.tsx` stubs `complete` directly and needs no edit. Resolve by running the `ai/tasks/hygiene/improve-modularity.md` task against `web/src/agent-tabs/AgentTabBody.tsx`.


* Move the harness tab's drag-into-terminal PTY write into a hook beside the component so the harness side of the drop contract stops living in JSX.

Existing Debt: §5 (components render, they do not decide) — `web/src/harness/HarnessTab.tsx` registers its drop handle in a component-body effect whose `insertAtCaret` focuses the terminal and sends the `ptyInput` RPC, putting the write-to-PTY protocol call in the component. Severity: 4/10

Existing Risk: 3/10 - The navigator-into-harness drop contract is spread across three files (the navigator's drag hook, the drop registry, and this component), and the harness side is exercisable only by rendering `HarnessTab` with the xterm layer mounted, so every change to the contract is re-verified through a full render.

Proposal Risk: 2/10 - The write becomes a hook-level seam testable without the tab's markup, but the registry handshake remains a three-file contract and nothing stops the next drop consumer from wiring its own `insertAtCaret` by hand.

Proposal: Extract a `useHarnessPtyDrop` hook into `web/src/harness/` beside `HarnessTab.tsx`, owning the publish/teardown of the drop handle and the `ptyInput` send, and reduce the component's effect to a single call. `web/src/harness-drop-registry.ts`'s `registerHarnessDrop` signature does not change, and `web/src/file-navigator/useFileNavigatorDrag.ts` consumes the registry rather than the component, so the blast radius is the one harness file plus the new hook. `web/src/harness/HarnessTab.test.tsx`'s file-navigator-drop-target cases (handle registered under the PTY id, dropped path typed into the PTY, nothing published without a PTY) render the component and must keep passing without edits. The target is terminal/PTY code, so this is written without a playbook trigger and needs hand-planning.


* Move the launch-dialog and confirm-dialog keyboard hooks the shared layer already depends on into the shared directory, finishing the client shared-primitives relocation.

Existing Debt: §2 (colocate; promote to shared only on the second consumer) — `web/src/shared/ConfirmDialogShell.tsx` imports `useConfirmDialogKeys` from `../useConfirmDialogKeys`, and both `web/src/harness/HarnessLaunchDialog.tsx` and `web/src/ScheduleLaunchDialog/ScheduleDialog.tsx` import `use-launch-dialog` from the root, yet their sibling dialog primitives (`useDialogKeyboard`, `ModalDialog`, `ConfirmDialogShell` itself) were just moved into `web/src/shared/` by the shared-primitives relocation, leaving these two hooks stranded in the root flat namespace. Severity: 3/10

Existing Risk: 3/10 - The root remains a place where shell composition, the protocol client, and generic shared primitives are indistinguishable to an importer, so the next dialog primitive gets added to the root by precedent and the shared layer keeps drifting back out of `shared/`.

Proposal Risk: 1/10 - The move is mechanical and the only way it bites is a stale relative import, which the typecheck fails loudly on the moment it lands.

Proposal: Move `web/src/use-launch-dialog.ts` to `web/src/shared/use-launch-dialog.ts` and `web/src/useConfirmDialogKeys.ts` to `web/src/shared/useConfirmDialogKeys.ts`. Update the three import sites: `web/src/harness/HarnessLaunchDialog.tsx` and `web/src/ScheduleLaunchDialog/ScheduleDialog.tsx` change `../use-launch-dialog` to `../shared/use-launch-dialog`, and `web/src/shared/ConfirmDialogShell.tsx` changes `../useConfirmDialogKeys` to `./useConfirmDialogKeys`. No exported signature changes, so no other file is affected, and the two hooks land beside their colocated neighbor `web/src/shared/useDialogKeyboard.ts`. Neither hook has a direct test file; the dialog render suites that go through `ConfirmDialogShell` must keep passing unchanged.


* Consolidate the identical list-selection clamp arithmetic reimplemented by the conversations, sessions, and schedules plugin lists into one shared module.

Existing Debt: §2 (promote to shared on the second real consumer) — `web/src/plugins/conversations/conversation-list-keys.ts`'s `nextConversationSelection`, `web/src/plugins/sessions/sessions-keys.ts`'s `nextSessionSelection`, and `web/src/plugins/schedules/schedules-keys.ts`'s `nextSelection` are three copies of the same non-wrapping clamp over ArrowDown/ArrowUp/Home/End, each list component re-declaring its own key set, and `sessions-keys.ts`'s header comment hand-tracks the equivalence to the conversations list. Severity: 3/10

Existing Risk: 3/10 - A gesture change (PageUp support, wrap-at-ends, first-click-confirms semantics) must be re-applied in three plugin features by hand, and the equivalence is maintained by comments, so one list silently drifts from the others.

Proposal Risk: 2/10 - One shared rule replaces three copies, but the module becomes the meeting point of four list features and could accrete per-feature flags if the next variant is folded in instead of kept a separate colocated helper.

Proposal: Add `web/src/shared/list-selection.ts` exporting `nextListSelection(length, selected, key)` with the non-wrapping clamp the three copies implement, and retarget the three keys modules — `web/src/plugins/conversations/conversation-list-keys.ts`, `web/src/plugins/sessions/sessions-keys.ts`, and `web/src/plugins/schedules/schedules-keys.ts` — to delegate to it, leaving their call sites in `ConversationList.tsx`, `SessionList.tsx`, and `SchedulesTab.tsx` untouched. The navigator's richer `handleFileNavigatorKey` in `web/src/file-navigator/file-navigator-keys.ts` is deliberately out of scope. The three colocated suites (`conversation-list-keys.test.ts`, `sessions-keys.test.ts`, `schedules-keys.test.ts`) pin today's arithmetic and must keep passing unchanged. Four files across four directories change, so no single-file extraction applies and this is hand-planned.

## deferred

## declined

* Protect user edits made after a copy-paste before undo deletes its destination in `src/file-navigator/moves.ts`: `undoCopyPaste` records only absolute source and destination paths and unconditionally removes each destination, so editing or replacing a copied file before pressing undo silently deletes the newer content. Record enough identity or content metadata with each copy history entry to detect divergence and surface a conflict instead of removing a changed destination. Severity: **high**. — deferred: complexity 8/10, requires recursive destination identity tracking plus new undo conflict semantics across server history and client conflict handling.

* Stop the sandbox-confinement tests from passing vacuously off darwin in `src/sandbox/index.test.ts`: seventeen cases open with a bare `if (!sandboxAvailable()) return;`, and `sandboxAvailable()` requires `process.platform === 'darwin'` plus `/usr/bin/sandbox-exec`, so on the `ubuntu-latest` runners every job in `.github/workflows/ci.yml` uses, all of them return before their first assertion and are reported as *passing* rather than skipped. Every assertion about the Seatbelt profile the security model rests on — the `-D` param bindings, the secret-deny paths, the credential scrub, the `TMPDIR` override, the offline variant — therefore only ever runs on a developer's Mac, and CI would stay green if the confined path were deleted outright. Convert them to `describe.skipIf(!sandboxAvailable())` (or `it.skipIf`) so a run that cannot exercise confinement reports skips instead of green passes. Severity: **high**. declined: this application is currently limited to running on mac os x.
