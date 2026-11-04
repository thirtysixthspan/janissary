# Limit the editor connections window's close control to persona rows

## Complexity

2/10 — an optional row predicate on one shared presentational component, one call-site predicate, one guard in the editor connections hook, and focused tests; no wire, server, or plugin payload change.

## Goal

An editor tab's connections window lists both its own persona connections and any running agent run started from that tab. Only a persona row has an editor persona to close, but `EditorConnectionsPanel` supplies `onCloseRow` for every row, so the agent row renders a close control that either does nothing or, when the editor tab also holds a core ACP session, closes that unrelated session. Limit the close control to rows whose ACP reference is editor-scoped, and make the hook refuse a close for any other row even if a future caller supplies one.

## Approach

Add an optional per-row predicate to `StatusPanels` rather than changing the shared component's behavior for callers that do not use it:

- `canCloseRow?: (row: ConnectionView) => boolean` on `StatusPanels`' properties.
- A row renders the close control only when `onCloseRow` is supplied and either no predicate is supplied or the predicate returns true. Existing callers that pass only `onCloseRow` keep today's behavior; no caller outside the editor supplies `onCloseRow` today.
- `EditorConnectionsPanel` passes `canCloseRow={(row) => row.acpRef?.scope === 'editor'}` alongside its existing `onCloseRow`.
- `useEditorConnections.closeRow` adds the same `row.acpRef?.scope === 'editor'` guard ahead of the existing editor-payload check, so a record-id agent row cannot become a persona close even through a direct caller.

The record-id agent row keeps its existing open action and its record tab's **Terminate** control. The transcript button is unaffected: an editor-persona row still shows both the transcript and close controls.

## Implementation

1. Add `canCloseRow` to `web/src/shared/status-windows/StatusPanels.tsx`, thread it through `ConnectionRow`, and gate the close button on both the handler and the predicate.
2. Pass the editor-scope predicate from `web/src/editor/EditorConnectionsPanel.tsx`.
3. Guard `closeRow` in `web/src/editor/useEditorConnections.ts` with the same scope check.
4. Run `./scripts/run.mjs check-diff` after each step.

## Tests

- `web/src/shared/status-windows/StatusPanels.test.tsx`: a predicate that fails for a record-id row and passes for an editor-persona row renders a close control only on the persona row; the existing close-control isolation test (close does not open the row) continues to pass.
- `web/src/editor/EditorConnectionsPanel.test.tsx`: the record-id agent row renders no close control while the persona row still renders and fires one; opening the agent row by pointer is unchanged.
- `web/src/editor/useEditorConnections.test.ts`: `closeRow` still sends a persona close for an editor-scoped row, and sends nothing for a record-id row or a row whose ACP reference is not editor-scoped.
- `web/src/editor/EditorTab.test.tsx`: the existing persona-row fixtures gain their editor-scoped `acpRef`, so the close-control integration test continues to exercise a real persona row.

## Spec

Update `product/specs/connection.md` to state that only an editor tab's persona rows carry a close control; a running agent row in that window opens its record tab and has no close control there, its **Terminate** remaining in the record tab.

## Docs

None needed: no command, flag, key binding, or user-documentation page describes this control.

## Out of scope

- Changing close controls on agent, shell, harness, or monitor windows; those call sites do not pass `onCloseRow` and keep today's read-only rows.
- Adding a close control to agent-run rows or routing it to run termination.
- Any server, protocol, plugin payload, or connection-row shape change.
