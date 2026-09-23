# Combine the docked Sessions controls

## Complexity

4/10. A small client presentation change across the plugin host and Sessions, with no server or wire changes.

## Goal

Show Refresh and the dock-cycle control in one metadata bar when Sessions is docked on either side.

## Approach

Publish a `PluginActionsHeader` component through the existing client plugin API. In the centre it renders the plugin's ordinary metadata header. In a sidebar it portals its children into an action slot owned by that docked plugin's host frame. The context and portal target remain host details; the plugin never imports sidebar code or controls docking. Plugins that do not use this component retain their existing headers. This is an additive UI component, so existing plugin contracts remain compatible.

## Implementation

1. Add the host-owned header component and per-docked-tab action slot, update Sessions to use it, and style buttons in the sidebar action group consistently. Correct the existing docked-frame comment to describe the slot. Run `check-diff`.
2. Add regression tests for both sidebar placements, refresh and dock intents, switching sidebar entries without losing or duplicating controls, removing a tab, and returning Sessions to the centre. Existing tests cover plugins that do not use the new header and the centre Refresh/Split layout. Run `check-diff`.
3. Update `product/specs/sessions-tab.md`, the docking behavior in `product/specs/tab-plugins.md`, and the existing header description in `documentation/user-documentation/tab-types/sessions.md`. No help command changes are needed. Complete the plan and remove only the first PR backlog entry.

## Tests

Use the real Sessions plugin through the plugin registry and sidebar host in a new colocated integration test. Assert one metadata bar, both controls in it, no Split when docked, correct tab-bound refresh and indexed dock requests, isolated controls for multiple sidebar entries, cleanup on removal, and centre controls after undocking. Run the diff-scoped gate, targeted CSS lint, and the production web build to verify the additive API does not eagerly import Sessions.

## Out of scope

Automatic session refresh on connection changes (the remaining backlog entry), other plugins' header layouts, server behavior, PR title or description changes, and merging the PR.
