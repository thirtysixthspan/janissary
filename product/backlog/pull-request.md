<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* the msg command to a shell tab, of each type, should be supported.


* Scope the published app command-bar state to the shell tab that owns it, so one tab's queue popup cannot overwrite every shell's draft, and wake an idle shell when another tab queues a line for it.

Existing Issue: `AppCommandBarProvider`/`useAppCommandBar` give every plugin body the current tab's `queueOpen`, `queueIndex` and `queueItems`, the raw insertion map, `onFocusTab` and an `intercept` that takes any source tab, and `ShellTab`'s queue effect reacts to that global state ungated, while a line queued for an idle shell by `send` or `queue` from another tab never wakes that shell's drain. Severity: 7/10

Existing Risk: 7/10 - Opening and closing `Ctrl+E` in an agent tab overwrites and then clears the unsent draft in every mounted shell, steals focus into a visible docked shell whose typing then edits the agent's queue, and `send <shell> ls` to an idle shell waits indefinitely, contradicting the spec's "runs right away".

Proposal Risk: 3/10 - Each shell sees only its own queue state and wakes on its own queue changes, though the published surface still needs a contract-level review once a second command-bar plugin exists.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: scope app command-bar state to the owning shell tab and wake idle shells on queued lines". In `web/src/shared/command-bar/AppCommandBar.tsx`, record which tab the queue popup belongs to (the picker source tab) and expose `queueOpen`/`queueIndex`/`queueItems` to a consumer only when that tab equals the consumer's label; replace the raw insertion map with a `registerCommandLineInsertion(label, handler)` returning an unregister function, and bind `intercept`'s source tab at the provider rather than taking it from the caller. Stop exporting `AppCommandBarProvider` from `web/src/plugins/api.ts` (keep it imported by `web/src/App.tsx` from its defining module). In `web/src/plugins/shell/ShellTab.tsx`, pass the tab's own label so the queue effect only runs for this tab. For waking: have `src/commands/send.ts` and `src/commands/queue.ts`, when the target is a terminal-owning plugin tab, cause the shell tab's view to change (for example bump a `queuedCount` field in the shell payload through `updateTab`, or include the queue length in the host-state slice), and in `web/src/plugins/shell/useShellCommandQueue.ts` wake the queue when this tab's own count increases and zsh is idle. Add a `ShellTab.test.tsx` case that toggling `queueOpen` for a different source tab leaves the draft and focus alone, a case that an idle shell drains a line added by another tab, and keep `web/src/shared/command-bar/AppCommandBar.test.tsx` and the `src/commands/send.test.ts`/`queue.test.ts` cases passing.


* Open pickers raised from a shell command bar over the tab that raised them and act on that tab's bar and queue.

Existing Issue: The task and queue pickers decide which command bar and queue to use from the current tab rather than the picker's source tab, and a picker raised by a hidden, undocked shell (for example while draining its queue) is rendered nowhere while still taking modal keys. Severity: 6/10

Existing Risk: 6/10 - A task picked from a docked shell's `tasks` picker is inserted into the centre agent bar, `queue` from a docked shell lists the agent's queue, and a queued `tasks` line in a background shell opens an invisible picker that captures arrow, Return and Escape in whatever tab is in front.

Proposal Risk: 3/10 - Pickers follow their source tab and an invisible source falls back to the visible tab, with residual risk in any picker hook not yet keyed on the source tab.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: key shell-raised pickers on their source tab". In `web/src/pickers/useTaskPicker.ts`, choose the insertion target from `pickerSourceTab ?? current.label` (and only use the shell insertion path when that tab is a shell); in `web/src/pickers/useQueuePicker.ts` and `web/src/pickers/usePickerOverlays.ts`, take `isShellTab`, `queueItems` and the edit/delete targets from the source tab's record instead of `current`. In `web/src/App.tsx`, where `pickerSourceTab` is set, refuse to set a source tab that is neither the current tab nor docked-and-visible (clear the source so the picker renders over the current tab), or skip opening a picker for an invisible source. Add App-level tests (in `web/src/App.test.tsx` or `web/src/pickers/useTaskPicker`/`useQueuePicker` tests) that a docked-shell `tasks` pick calls the shell's insertion handler and that an intercept from a hidden shell does not leave an unrendered modal picker; keep `web/src/pickers/useQueuePicker.test.tsx` passing.


* Store the host-state delivery fingerprint on the plugin tab record instead of a module-level map keyed by plugin and instance.

Existing Issue: `src/plugins/host-state.ts` keeps `lastPushed`, a module-level `WeakMap<PluginRecord, Map<instanceKey, fingerprint>>` cleaned by a manual sweep, which is the parallel per-tab map that architecture principle 2 and the plugin guidelines rule out. Severity: 3/10

Existing Risk: 3/10 - A tab closed on a path the sweep does not see leaves a stale fingerprint, so a reused instance key can skip its first host-state push and show empty connection or schedule windows.

Proposal Risk: 1/10 - The fingerprint lives and dies with the tab record, with residual risk only if tab rebuilds drop the runtime sub-record.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: keep the host-state fingerprint on the plugin tab record". Move the last-pushed fingerprint into the tab's runtime record via `tabRuntime(tab)` from `src/tab/runtime.ts` (as `src/harness/idle-notification.ts` does for its own per-tab state), read and write it in `src/plugins/host-state.ts`, and delete the `WeakMap` and its sweep. The label-reuse and change-detection cases in `src/plugins/host-state.test.ts` must keep passing unchanged.


* Replace the core's hard-coded checks for the shell plugin with declared plugin capabilities.

Existing Issue: Core client code branches on `plugin?.id === 'shell'` in the mounted view layers, picker overlays and queue picker, and the tab strip imports the shell's payload guard to drive the busy dot, so the core depends on one plugin's id and payload shape. Severity: 4/10

Existing Risk: 4/10 - The next plugin with a command bar silently gets none of the picker, queue or busy behavior, and a change to the shell payload breaks the tab strip, against the plugin guidelines' registry-over-conditionals rule.

Proposal Risk: 2/10 - Behavior is driven by declared flags on the plugin and a host-set busy state, with residual risk in getting every former shell branch onto the new flag.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: replace hard-coded shell plugin checks with declared capabilities". Add a declaration flag (for example `hostsCommandBar: true`) to the plugin declaration in `src/plugins/api.ts`, validate it in `src/plugins/declared-resources.ts`, set it in `src/plugins/shell/manifest.ts`, and carry it on the tab's wire view in `src/tab/view.ts`. Replace the `plugin?.id === 'shell'` checks in `web/src/MountedViewLayers.tsx`, `web/src/pickers/usePickerOverlays.ts`, `web/src/pickers/useQueuePicker.ts` and `web/src/pickers/useTaskPicker.ts` with that flag. For the busy dot, have the shell's `command-state` intent in `src/plugins/shell/activate.ts` set the tab's host busy or running state through a capability, and drop the `isShellPayload` import from `web/src/TabItem.tsx`. Keep `web/src/TabStrip.test.tsx`, `web/src/MountedViewLayers.test.tsx` and the picker tests passing and add a declaration-validation case for the flag.


* Remove the shell overlay branches in the mounted view layers that never render, and stop drawing two tab navigators over a shell tab.

Existing Issue: `MountedViewLayers` renders `quickOpenOverlay`, `appThemePickerOverlay` and `contributedOverlay` for a shell only when `pickerOverlays` is absent, but `AppMain` always passes it, so those branches and the elements built for them are dead, and with the navigator open over a shell both the explicit `TabNavPicker` and `pickerOverlays`' own navigator render. Severity: 4/10

Existing Risk: 4/10 - Two stacked tab navigators appear over a shell tab, and the dead props and their tests describe a rendering path production never takes.

Proposal Risk: 1/10 - One navigator and no unused props, with residual risk only in tests that relied on the dead path.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: remove dead shell overlay branches and the duplicate tab navigator". In `web/src/MountedViewLayers.tsx`, delete the three `!pickerOverlays && ...` shell branches and render the explicit `TabNavPicker` only for plugin tabs that do not receive `pickerOverlays`; remove the now-unused `quickOpenOverlay`/`appThemePickerOverlay`/`contributedOverlay` props from `web/src/AppMain.tsx` and the element built for them in `web/src/pickers/picker/overlay-props.ts` if nothing else consumes it. Update `web/src/MountedViewLayers.test.tsx` so its shell cases pass real `pickerOverlays`, and add a case with a shell tab, `navOpen`, and `pickerOverlays` expecting exactly one `.tab-nav-picker`.


* Use the existing shared textarea splice helper in the shell tab instead of a copy.

Existing Issue: `insertCommandAtCaret` in the shell plugin is a line-for-line copy of `spliceIntoTextarea` in the shared command-bar module, with no test of its own. Severity: 2/10

Existing Risk: 2/10 - A fix to caret insertion (undo behavior, caret placement) lands in one copy and not the other, so clipboard and picker insertion behave differently in shell and agent bars.

Proposal Risk: 1/10 - One helper published through the plugin API, with no behavior change expected.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: reuse spliceIntoTextarea in the shell tab". Export `spliceIntoTextarea` from `web/src/plugins/api.ts` (importing it from `web/src/shared/command-bar/textarea-splice.ts`), replace the uses of `insertCommandAtCaret` in `web/src/plugins/shell/` with it, and delete `web/src/plugins/shell/insert-command-at-caret.ts`. Add `spliceIntoTextarea` to the export assertions in `web/src/plugins/api.test.ts` if that test pins the surface; existing `ShellTab.test.tsx` clipboard and task insertion cases must keep passing.


* Correct the pull request description's file list and behavior summary to match the branch.

Existing Issue: The description lists 37 `product/plans/complete/*.md` files as removed although none exists on master or appears in the diff, omits the three follow-up plans, `product/backlog/pull-request.md` and `web/src/plugins/shell/shell-command-input.ts` with its test, and never mentions the terminal copy chord, the bracketed-paste multi-line submit, or the exclusion of startup hooks from shell history. Severity: 3/10

Existing Risk: 3/10 - A reviewer verifying the file list hunts for deletions that do not exist and approves three user-visible behaviors the description never asked them to check.

Proposal Risk: 1/10 - The description matches the diff, with residual drift only from commits added after the correction.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: correct the description's file list and behavior summary". In the pull request body's "Files changed" section, delete the 37 "remove the consolidated fix plan" bullets, add bullets for `product/plans/complete/shell-tab-ignore-startup-history.md`, `product/plans/complete/shell-tab-keyboard-copy.md`, `product/plans/complete/shell-tab-multiline-submit.md`, `product/backlog/pull-request.md`, and `web/src/plugins/shell/shell-command-input.test.ts` and `web/src/plugins/shell/shell-command-input.ts`; in "What" and "How to verify", add one sentence each for `Ctrl+Shift+C`/`Cmd+C` terminal copy, multi-line commands submitted to zsh as one bracketed paste, and the setup hook being kept out of shell history. Compare the final list against `git diff origin/master...HEAD --name-only` before applying. Leave every other paragraph and the title untouched.


* Reconcile the shell-tab plan's stale statements about tab naming and directory tracking with its own later sections and the implementation.

Existing Issue: The plan's design decisions still say each tab is named `shell`, `shell2` while its summary, the spec and the code use the agent-name pool with a `shell`, `shell-2` fallback, and its "Declined" list says the metadata row reports the starting directory while its design decisions and the code follow zsh's cwd. Severity: 2/10

Existing Risk: 2/10 - A later agent reading the plan as the record of intent "fixes" the cwd tracking or the naming back to the declined or stale behavior.

Proposal Risk: 1/10 - The plan agrees with itself and the spec, with no code change.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: reconcile the shell-tab plan's naming and cwd statements". In `product/plans/complete/shell-tab.md`, rewrite the "The tab is named `shell` and is opened by `zsh`" decision to describe agent-pool naming with the `shell`, `shell-2` fallback (matching `src/tab/creators.ts`, `src/tab/unique-labels.ts` and `product/specs/shell-tab.md`), and change the declined "A tab name that follows `cd`" bullet so it declines only renaming the tab, not cwd tracking in the metadata row. No code or spec changes.
