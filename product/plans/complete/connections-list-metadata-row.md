# Connections list metadata row

Issue: in the connections tab, like the sessions tab, include a metadata row with refresh and split actions.

Complexity rating: 3/10

## Goal

The sessions list opens with a full-width metadata bar holding Refresh and Split at its right edge, and when docked it hands Refresh to the sidebar's own header beside the dock-switch control, with no Split. The connections list has no header at all: it starts straight at its empty message or its column headings, so there is no way to split it and nothing that re-reads it. Give the connections list the same metadata row, with the same two controls, behaving the same way centred and docked.

## Approach

The sessions tab is the model, and both halves of it already exist as host-published pieces.

On the client, `SessionList` renders `PluginActionsHeader` (from `web/src/plugins/api.ts`) with class `plugin-meta session-list-header`, holding a `plugin-actions` span with an icon-only Refresh button (`faRotate`, `title` and `aria-label` `Refresh`) followed by `capabilities.splitAction`. `PluginActionsHeader` already handles docking: centred it renders its own `div`, docked it portals the children into the sidebar header's action slot, and the host passes a null `splitAction` to a docked tab. `ConnectionList` gets the same header, first in the tab, above the empty message, the inline error, the column headings, and the rows. It appears for an empty list too, as the sessions header does.

The Refresh button routes through `useConnectionsController`, as every other connections intent does, so a refused refresh shows its error inline in the list the same way a refused Close or Delete does.

On the server, sessions' `refresh` intent asks its topic owner to re-read remote state (`topicAction({ topic: 'sessions', action: 'refresh' })`). The connections topic has no such action and needs none: its data is composed on demand by `topicData('connections')`, so re-reading is just reading it again and pushing the result to the list tab. The connections plugin gains a `refresh` intent that:

- requires an empty payload, using the existing (currently unused) `isEmptyIntent` guard in `src/plugins/connections/shared.ts`, and otherwise rejects with `invalid refresh payload`;
- applies only to the list: on a record tab payload it rejects with `refresh applies only to the connections list`;
- re-reads `connectionsData(capabilities)` and calls `updateTab('connections', …)` with a list payload built the same way the notification path builds it, with record windows stripped from the summary rows. No title is sent, matching the notification update.

This adds no host capability, topic action, or API surface; `topicData` and `updateTab` are already in the manifest. `ConnectionsIntent` in `shared.ts` gains the `refresh` variant so the intent union stays a complete description.

To keep one definition of the list payload, `ConnectionTabs` in `src/plugins/connections/tabs.ts` gains a small `listPayload(rows)` helper used by `openList`, `update`, and the new `refreshList(capabilities)` method.

Styles follow `sessions.css`: `.connections-list-header` takes the sessions header's band (`min-height: 28px; padding: 6px 12px; font-size: 12px; border-bottom: 1px solid var(--border)`) and its muted icon-button treatment, so the refresh icon doesn't arrive with browser button chrome.

The list's keyboard handler already ignores key events whose target is neither the list nor a row, so Enter or Space on Refresh or Split acts on that control alone and never opens the selected row. That holds when docked as well, where React still bubbles the portaled button's events to the list.

## Implementation steps

1. `src/plugins/connections/shared.ts`: add `{ intent: 'refresh'; payload: Record<string, never> }` to `ConnectionsIntent`.
2. `src/plugins/connections/tabs.ts`: extract `listPayload(rows)`; use it in `openList` and `update`; add `refreshList(capabilities)` that re-reads the topic and updates the list tab.
3. `src/plugins/connections/activate.ts`: handle the `refresh` intent with the payload and tab-kind checks above, delegating to `tabs.refreshList`.
4. `web/src/plugins/connections/useConnectionsController.ts`: add `refresh()` sending `refresh` with `{}` through the guarded path.
5. `web/src/plugins/connections/ConnectionList.tsx`: render `PluginActionsHeader` with class `plugin-meta connections-list-header`, the Refresh button, and `capabilities.splitAction`, as the first child of the list.
6. `web/src/plugins/connections/connections.css`: add the header band and its button rules.

## Tests

- `src/plugins/connections/activate.test.ts`: a `refresh` on the list re-reads the topic and updates the `connections` tab with the current rows, with a loaded record window stripped from the list payload and no title; a non-empty payload is rejected with `invalid refresh payload`; a `refresh` from a record tab is rejected with `refresh applies only to the connections list` and updates nothing; neither rejection reports a failure.
- `web/src/plugins/connections/ConnectionList.test.tsx`: the header renders Refresh and the supplied split control together in `.connections-list-header`, including for an empty list, and is the list's first child; clicking Refresh sends `refresh` with `{}` and neither selects nor opens a row; Enter on Refresh doesn't open the selected row; a refused refresh shows its error inline.
- `web/src/plugins/ConnectionsDockedHeader.test.tsx` (mirroring `SessionsDockedHeader.test.tsx`): docked in either sidebar, Refresh sits in the single sidebar header beside the dock-switch control, with no Split and no second header, and routes `refresh` to its own tab; undocked, the centre header holds Refresh and Split with no sidebar header.
- `web/src/plugins/connections/connections-style.test.ts`: the header uses the full-width band and the muted metadata-row button treatment.

## Out of scope

- Re-reading the list when the tab is brought back into focus, which the sessions list does. The connections list is already pushed every change through its topic, so Refresh here is for re-reading on demand; the entry names only the metadata row and its two controls.
- Row styling and keyboard interactions, which are the next backlog entry.
- The connection (record) tab's metadata row, which already exists and is a different tab.

## Specs and docs

- `product/specs/connections-tab.md`: describe the list's metadata row, its Refresh and Split controls, the docked layout, and what Refresh does.
- `documentation/user-documentation/command-bar/connections.md` and `help/connections.md`: checked; neither describes the list's header, so no change.
