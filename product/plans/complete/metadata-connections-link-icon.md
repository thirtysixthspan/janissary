# Use a link icon for metadata connections controls

**Complexity: 2/10** — a shared client icon alias is consumed by the two existing metadata rows. The remote-session status plug is a distinct semantic icon and remains unchanged.

## Goal

Replace the plug glyph on metadata-row connections controls with a link glyph, so the control better represents opening the connections panel.

## Approach

`connectionsWindowIcon` is the shared semantic icon used by both `AgentTabMeta` and `EditorMetaRow`. Change that alias from Font Awesome's `faPlug` to `faLink`, leaving `connectionStatusIcon` on remote-session state indicators as the plug. Add assertions at the agent/harness and editor render boundaries so both consumers retain the intended glyph.

## Implementation steps

1. Update `web/src/icons.ts` so `connectionsWindowIcon` exports `faLink` while `connectionStatusIcon` continues to export `faPlug`.
2. Add focused metadata-row assertions in `web/src/shared/AgentTabMeta.test.tsx` and `web/src/editor/EditorTab.test.tsx` that the connections control renders the `link` icon.

## Tests

- `web/src/shared/AgentTabMeta.test.tsx` — verifies the shared agent/harness metadata control renders Font Awesome's link glyph.
- `web/src/editor/EditorTab.test.tsx` — verifies the editor metadata control renders the same link glyph.

## Spec updates

- `product/specs/connection.md` — describe the metadata connections button as a link icon.

## Docs

- `documentation/user-documentation/command-bar/connections.md` — describe the metadata control as a link icon.

## Out of scope

- Remote-session state and action icons, which intentionally use the plug family.
- Any behavior of the connections window or its tooltips.
