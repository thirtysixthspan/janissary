# Shell pickers follow their source tab

**Complexity: 6/10** — mostly client wiring across the picker hooks, the app shell, and the scoped command-bar surface, plus one optional wire field so a queue edit names the tab it edits. No new architecture: the source tab is already recorded, and the plugin host already knows whether each body is on screen.

## Goal

A task or queue picker raised from a shell's command bar opens over that shell and acts on that shell's bar and queue, even when the shell is docked and the current tab is an agent. A shell that is not on screen never opens a picker that nobody can see but that still takes the modal keys.

Verified against the branch as it stands:

- `App` records `pickerSourceTab` when a plugin bar's line opens an overlay, and the overlays already render over that tab (centre layer, docked sidebar body, or editor). But `usePickerOverlays` derives everything from `current`: `queueItems`, the queue picker's tab, the task picker's `shellLabel` and `harnessPtyId`. A `tasks` pick from a docked shell while an agent is current therefore inserts through the agent's drop handle, and `queue` lists the agent's queue.
- `useAppCommandLine` calls the opener before `onPickerOpen(sourceTab)`, so `openQueue` gates on the current tab and copies the current agent's first queued line into the agent bar when the popup is really for a shell. `closeQueue` clears the agent bar unconditionally on Escape.
- `editQueuedCommand` and `deleteQueuedCommand` carry only an index, and `src/controller/tab-adapter.ts` applies them to `managers.tab.cur()`. A docked shell's queue cannot be edited while an agent is current without naming the tab on the wire.
- A queued `tasks` line draining in a hidden shell reaches `appBar.intercept`, which opens the task picker and records the hidden shell as its source. No visible layer draws it (the centre layer draws plugin overlays only for the current tab, the sidebar only for its selected entry), yet the window key handler still routes arrow, Return and Escape to it.
- `PluginBody` already receives `active` — whether the body is the visible one in its pane, or the selected entry in its sidebar — and wraps every body in `AppCommandBarTabScope`. App itself does not know which sidebar entry is selected, so the scope is the place to carry visibility.

## Approach

- **Pickers act on the picker tab.** `usePickerOverlays` takes the recorded `sourceTab` and resolves the picker tab as that tab when it is open, otherwise the current tab. The queue items, the queue picker, and the task picker's insertion target (`shellLabel`, `harnessPtyId`) all come from the picker tab. The history picker keeps reading the current tab, since a shell answers `hist` with its own list.
- **The queue opener is told its source.** The bare-word openers take an optional source tab (`PickerCommands` opener type `(sourceTab?: string) => void`); `openCommandBarOverlay` passes it through. `openQueue(sourceTab)` resolves that tab for its gate and its initial selection, so a shell source opens without recalling anything into the agent bar. Closing the popup clears the agent bar only when the popup was an agent tab's.
- **Queue edits name their tab.** `editQueuedCommand` and `deleteQueuedCommand` gain an optional `tab` param, defined once in `src/protocol/core-rpc.ts` and validated in `src/client-params/core.ts` the way `ptyInput` validates its optional `tab`. The adapter edits that tab's queue, falling back to the current tab when it is absent. The client always sends the picker tab's label.
- **A hidden source opens nothing.** `AppCommandBarTabScope` takes `active` from `PluginBody`, and the scoped `intercept(line)` forwards it as a third argument. `useAppCommandLine` answers an overlay word or `nav` from a tab that is not on screen as handled without opening anything or recording a source, so the shell records the line and its queue moves on. This is the same "interactive pickers are no-ops when nothing can show them" rule the server's `tasks` and bare `queue` commands follow. `active` defaults to true so a scope with no visibility answer behaves as before.
- **A closed source does not strand a picker.** `App` drops the recorded source when that tab is no longer open, so an open picker falls back to drawing over, and acting on, the current tab.

Rejected: clearing the source of a hidden shell's picker so it renders over the current tab. The picker would then insert a task into, or list the queue of, a tab the line never came from. Rejected: computing sidebar selection in `App`. It is local state in each `Sidebar`, and the host already hands each body its visibility.

## Implementation steps

1. Server wire: optional `tab` on the two queue RPCs in `src/protocol/core-rpc.ts`, its decoder in `src/client-params/core.ts`, passed through in `src/message/tabs.ts`, and applied in `src/controller/tab-adapter.ts`.
2. `web/src/shared/command-bar/picker-commands.ts`: the six openers take an optional source tab. `bare-openers.ts`: `openCommandBarOverlay(command, pickers, sourceTab)` passes it on.
3. `web/src/pickers/useQueuePicker.ts`: take the picker tab and the tab list; `openQueue(sourceTab?)` resolves its tab for the gate and the initial recall; `closeQueue` clears the agent bar only for an agent tab; edits and deletes send the picker tab's label.
4. `web/src/pickers/usePickerOverlays.ts`: take `sourceTab`, resolve the picker tab, and feed the queue and task pickers from it. `web/src/App.tsx`: pass `pickerSourceTab`, and clear it when its tab closes.
5. `web/src/shared/command-bar/app-command-bar-scope.ts`, `AppCommandBar.tsx`, `web/src/useAppCommandBarState.ts`, `web/src/plugins/PluginBody.tsx`: carry `active` through the tab scope into `intercept`, and have `useAppCommandLine` open nothing for a source that is not on screen.

## Tests

- `src/client-params/core.test.ts`: the queue RPCs accept an optional string `tab` and refuse a non-string one.
- `src/controller/tab-adapter.test.ts`: an edit and a delete naming a tab change that tab's queue; without one they change the current tab's.
- `src/message/handler.test.ts`: the `tab` param reaches the controller.
- `web/src/pickers/useQueuePicker.test.tsx`: `openQueue('shell1')` with an agent current opens without recalling into the agent bar; edits and deletes send the picker tab's label; Escape on a shell's popup leaves the agent bar alone.
- `web/src/pickers/usePickerOverlays.test.tsx`: with a docked shell as the source and an agent current, the queue lists the shell's queue and a picked task goes to the shell's registered insertion instead of the agent's drop handle.
- `web/src/shared/command-bar/AppCommandBar.test.tsx`: a line from a visible source opens the picker, passes the source to the opener, and records it; the same line from a hidden source opens nothing, records nothing, and is still reported handled; a scope rendered inactive forwards that to `intercept`.
- `web/src/shared/command-bar/app-command-bar-scope.test.ts`: the scoped `intercept` carries the scope's visibility.
- `web/src/plugins/PluginBody.test.tsx`: a body rendered inactive reports that to `intercept`.
- `web/src/App.test.tsx` is left alone; the hook tests cover the behavior without a full app render.

## Spec

- `product/specs/shell-tab.md`: pickers raised from a docked shell open over it and act on its bar and queue; a hidden shell opens none.
- `product/specs/tab-plugins.md`: the borrowed command bar's pickers follow the source tab, and a body not on screen opens no picker.
- `product/specs/agent-command-queue.md`: a `queue` typed into a shell's bar opens the popup for that shell.
- `documentation/user-documentation/command-bar/queue.md`: the same, for a shell docked in a sidebar.

## Out of scope

- `Ctrl+A` and `Ctrl+E` chords pressed in a docked shell's bar. The window key handler has no source tab and keeps opening over the current tab.
- The agent body's command input reading the queue popup as open while a shell owns it; the agent bar is not focused while the shell's popup is up.
- Any change to how the server runs `tasks` or a bare `queue` that reaches it.
