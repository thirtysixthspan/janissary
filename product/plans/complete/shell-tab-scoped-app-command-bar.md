# Shell tab scoped app command bar

**Complexity: 6/10** — a client-only reshaping of the published app command-bar surface: the app shell keeps providing one state object, the plugin host binds each plugin body to its own tab label, and the shell tab reads a view of that state narrowed to itself. It touches the published client contract, the app shell, the plugin host, and the shell body, but adds no wire field and no server code.

## Goal

Scope the published app command-bar state to the shell tab that owns it, so one tab's queue popup cannot overwrite every shell's draft, and wake an idle shell when another tab queues a line for it.

Verified against the branch as it stands:

- `AppCommandBarProvider` hands every mounted plugin body the same object: `queueOpen`, `queueIndex` and `queueItems` for whichever queue popup is open, the raw `pluginCommandLineInsertions` map, `onFocusTab(label)`, and `intercept(line, sourceTab)` that trusts whatever source tab the caller names. `ShellTab`'s queue effect reacts to that state ungated, so `Ctrl+E` in an agent tab writes the agent's first queued line into every mounted shell's bar, focuses each of them, and clears every draft when the popup closes. A docked shell that took focus that way then edits the agent's queue through `onEditQueued`.
- `useShellCommandQueue` wakes its drain when `appBar.queueItems` is non-empty. Those items are the current tab's queue (`usePickerOverlays` reads `current.commandQueue`), so a shell wakes only while it is the current tab, and every idle shell asks to dequeue its own queue whenever the current agent tab has queued lines.
- The server side already does what the wake needs. `send` and `queue` to a terminal-owning plugin tab call `managers.tab.enqueue`, which marks state dirty, and `buildTabView` carries every tab's own `commandQueue`, plugin tabs included. The proposal's server changes (a `queuedCount` payload field, or a host-state slice) are therefore unnecessary: the client already receives the shell's own queue and only has to read the right one.

## Approach

Split the provided state from what a plugin body sees.

- `AppCommandBarState` is what `App` provides once: the interception that still takes a source tab, `onFocusTab(label)`, the queue popup's state plus `queueTab` (the tab the popup belongs to), `queuedLinesOf(label)` (each tab's own command queue from the state broadcast), and `registerCommandLineInsertion(label, handler)`, which returns an unregister function and replaces the raw map on this surface.
- `AppCommandBar`, the published type, is that state narrowed to one tab by a pure `scopeAppCommandBar(state, label)`: `intercept(line)` with the source tab bound, `onFocusChange(focused)`, queue popup state and its edit and delete handlers only when `queueTab` is this tab (closed and empty otherwise), `queuedLines` for this tab's own queue, and `registerCommandLineInsertion(handler)` bound to this tab.
- `AppCommandBarTabScope` binds the label, and `PluginBody` wraps every plugin body in it with the label the host already knows. A plugin therefore cannot name another tab as its source, its focus target, or its insertion slot, because it never passes a label at all. `useAppCommandBar()` throws without either provider, keeping the existing "a missing provider is a wiring mistake" rule.
- `App` sets `queueTab` to the picker's source tab when one is recorded, otherwise the current tab. That matches where the popup is drawn today. The next backlog entry, which makes pickers act on their source tab, keeps the same owner.
- The shell wakes its drain on its own `queuedLines`, so a line `send` or `queue` adds from any tab reaches an idle shell whether it is current, docked, or in the background.
- `AppCommandBarProvider` stops being exported from `web/src/plugins/api.ts`: only the app shell provides it, and `App.tsx` imports it from its defining module already. The pickers keep the insertion map internally (`useTaskPicker` still looks a handler up by label), so the follow-up picker entry is unaffected.

Rejected: passing the label into `useAppCommandBar(label)`. It is smaller, but a plugin could still pass any label, which is the hole this entry closes. Rejected: a `queuedCount` payload field pushed from `send` and `queue`. The core commands cannot write a plugin's payload without a new host path, and the count would duplicate the queue the tab view already carries.

## Implementation steps

1. New pure module `web/src/shared/command-bar/app-command-bar-scope.ts`: `AppCommandBarState`, the scoped `AppCommandBar` type, `scopeAppCommandBar`, and `registerCommandLineInsertion(insertions, label, handler)` (unregister removes only the handler it added). The types live beside the scoping function rather than in the React module so neither module imports the other. `web/src/shared/command-bar/AppCommandBar.tsx`: add `AppCommandBarTabScope`, provide `AppCommandBarState`, and make `useAppCommandBar` return the scoped view, with the bound insertion registration kept at one identity across renders.
2. `web/src/useAppCommandBarState.ts` (new, app shell): assemble the state from the interception, ghost history, the picker bag, `queueTab`, the tabs, `setFocusedPluginTab`, and the insertion map, so `App.tsx` stays under the line limit. `App.tsx` provides its result.
3. `web/src/plugins/PluginBody.tsx`: wrap the plugin content in `AppCommandBarTabScope label={label}`.
4. `web/src/plugins/api.ts`: drop the `AppCommandBarProvider` export and update the comment.
5. `web/src/plugins/shell/`: move the queue-popup mirror and the insertion registration out of `ShellTab.tsx` into a new `useApplicationBarEdits.ts` hook, read the scoped fields, use `onFocusChange`, call `intercept(line)` in `useShellSubmit.ts`, wake `useShellCommandQueue` on `appBar.queuedLines`, and drop the now-unused `NO_QUEUE_ITEMS` constant.

## Tests

- `web/src/shared/command-bar/app-command-bar-scope.test.ts`: the owning tab sees the popup's state and handlers; another tab sees it closed and empty with no handlers; `intercept` and `onFocusChange` carry the bound label; `queuedLines` is the tab's own queue.
- `web/src/shared/command-bar/AppCommandBar.test.tsx`: `useAppCommandBar` throws without a tab scope and returns the bound view inside one, its insertion registration keeps one identity across renders; `registerCommandLineInsertion` registers under the label and its unregister leaves a newer handler for the same label alone.
- `web/src/useAppCommandBarState.test.ts`: the state reads each tab's own queue, and registration reaches the insertion map the pickers read.
- `web/src/plugins/PluginBody.test.tsx`: a plugin body's `useAppCommandBar` is bound to the tab label the host rendered it for.
- `web/src/plugins/shell/ShellTab.test.tsx`: opening and closing the queue popup for another tab leaves the shell's draft and focus alone; an idle shell drains a line another tab added to its own queue; a line queued for another tab does not make the shell ask for its next line. Existing queue, insertion and focus cases move to the scoped surface and keep passing, as do `AppCommandBar.test.tsx` and `src/commands/send.test.ts`/`queue.test.ts`, which this change does not touch.

## Spec

- `product/specs/tab-plugins.md`: the borrowed command bar section states that the application state a plugin body reaches is scoped to its own tab.
- `product/specs/shell-tab.md`: the queue popup only edits the bar of the shell it was opened over, and a line another tab queues reaches an idle shell wherever it is shown.

## Out of scope

- Which tab a picker opens over, and which tab's bar and queue the task and queue pickers act on, when they are raised from a docked or hidden shell (the next pull-request backlog entry).
- Any server change to `send`, `queue`, or the shell payload.
- A contract review of the published surface for a second command-bar plugin.
