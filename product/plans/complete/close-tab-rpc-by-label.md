# Make the closeTab RPC name the tab by its label

**Complexity: 4/10** — one wire method changes its parameter from a position to a label. The server side is a type, a decoder, a dispatcher arm, and a one-line resolution in the tab adapter; the client side is three senders. No new architecture, and every other index-addressed tab RPC stays as it is.

## Goal

A close from the tab strip's ×, a sidebar entry's ×, a docked plugin's close control, Cmd+W, or the save-changes dialog closes exactly the tab the user acted on, however the server's tab list has moved between the client's last snapshot and the server receiving the message.

## Approach

The tab list is server-owned and changes without any client action: `insertTabInGroup` places new plugin, editor, and file-navigator tabs mid-list, and agents, schedules, profiles, and monitors all open tabs on their own. `closeTab` addresses its target as `{ index }`, which the server resolves against whatever its list has become by the time the message arrives. A tab inserted in that window shifts every later position, so the close lands on a neighbour — and closing a workspaced agent or harness tab kills its process and deletes its clone.

`focusTab` beside it already takes `{ label }` and the tab adapter resolves it with `managers.tab.findIndex(label)`. Do the same for `closeTab`: the wire carries the label, the adapter resolves it at the moment of execution, and a label no longer present closes nothing.

On the client the tab strip, Cmd+W, and `MountedViewLayers` all call the app shell's `closeTab(index)` callback, which also runs `closeQuitsApp` and the save guard against the current snapshot. Those checks keep speaking in positions; only the send changes, reading `tabs[index].label` from the same snapshot the checks just used. `CloseSaveGuard` already holds the dialog's target in `labelRef` and currently turns it back into an index just to send it, so it sends the label directly and leaves "is it still there" to the server. The sidebar's two `onClose` handlers already have the entry's tab in hand.

The rejected alternative was keeping the index and adding the label alongside it as a cross-check. That doubles the wire shape for no gain: the label alone identifies the tab, and the server already owns the only list that matters.

## Implementation steps

1. `src/protocol/core-rpc.ts`: declare `closeTab` as `{ label: string }`.
2. `src/client-params/core.ts`: decode it with `isString(p.label)`.
3. `src/message/tabs.ts`: pass `message.params.label` to `controller.closeTab`.
4. `src/controller/tab-adapter.ts`: `closeTab(label: string)` resolves with `managers.tab.findIndex(label)` and returns without closing when it is `-1`.
5. `web/src/App.tsx`: after the quit and save-guard checks, send `{ label }` from `tabs[index]`, sending nothing when that position is empty.
6. `web/src/CloseSaveGuard.tsx`: the closing helper sends `{ label }` directly instead of converting it back to an index.
7. `web/src/Sidebar.tsx`: both `onClose` handlers send the entry tab's label.

## Tests

- `src/client-params/core.test.ts`: the `closeTab` row accepts `{ label }` and rejects a missing or non-string label, including the old `{ index }` shape.
- `src/message/handler.test.ts`: `closeTab` routes the label to the controller.
- `src/controller.test.ts`: the existing image-tab close case closes by label; a new case shows a `closeTab` for an unknown label closes nothing and leaves the active tab alone; a new case shows the label, not a stale position, picks the tab after another tab is inserted ahead of it.
- `web/src/CloseSaveGuard.test.tsx`: every expected send becomes `{ label }`. The "tab inserted before the selected one" and "deferred save while the list shifts" cases now pin that the label is sent rather than a recomputed index; the "tab is gone" cases send the label and leave the no-op to the server.
- `web/src/Sidebar.test.tsx` and `web/src/App.test.tsx`: expected sends become `{ label }`.

## Spec updates

- `product/specs/image-tab.md`, `product/specs/markdown-tab.md`, `product/specs/pdf-tab.md`: the close button closes its tab by name rather than by position, and a close for a tab that is already gone does nothing.
- `product/specs/editor-tab.md`: a completed save closes the tab it asked about by its label, wherever that tab sits, rather than at its position.
- `product/specs/tabs.md`: under the `close` command, state that every close gesture names the tab it was made on, so a tab opening or closing elsewhere in the meantime never redirects it.

## Docs

None expected. `help.md` and `documentation/user-documentation/` describe how to close a tab, not how the close is addressed, so nothing there becomes wrong.

## Out of scope

- The other index-addressed tab RPCs (`renameTab`, `setDock`, `moveTabToOtherPane`, `reorderTabTo`, `setActiveTab`). They share the race, but none destroys anything; each is a follow-up increment of the same shape.
- The index-based `closeTab(index)` callback shared by the client's tab strip, Cmd+W, and mounted views, and the save guard's `(index: number) => boolean` signature. They resolve against the client's current snapshot at the moment of the gesture, which is correct.
- Server-internal callers of `managers.tab.closeTab(index)`, which resolve their own index synchronously.
