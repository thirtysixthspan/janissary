# Right-align metadata actions

**Complexity: 3/10** — the affected controls already exist and most metadata headers already separate text from actions; the fix standardizes that structure in the few rows that still position individual buttons.

## Goal

Keep every metadata-header button grouped at the right edge of its row, regardless of which optional actions are present. In embedded page tabs, show the address first and place back, forward, reload, Split, and close together on the right.

## Approach

Use explicit action containers for agent, editor, image, Markdown, and page metadata rows. Give the containers the auto left margin that reserves the row's right edge, instead of assigning that responsibility to an individual button. Existing monitor, file navigator, notifications, and schedules headers already use right-side action containers and remain unchanged.

## Implementation steps

1. Add action containers around the buttons in agent, editor, image, Markdown, and page metadata headers, moving page navigation beside the page's other actions.
2. Update the metadata CSS so each affected action container stays together at the right edge, and remove button-specific auto margins that no longer own layout.
3. Update component and theme tests to verify metadata buttons live in right-aligned action containers and page actions follow the address.
4. Update the tab, editor, image, Markdown, and embedded-page functional specs, plus existing user documentation that describes metadata controls, to state that action buttons are grouped on the right.

## Tests

- `web/src/theme.test.ts` verifies metadata action containers reserve the right side of their row.
- `web/src/AgentTabMeta.test.tsx` verifies all optional agent metadata buttons share the action container.
- `web/src/EditorTab.test.tsx` verifies editor metadata buttons share the action container.
- `web/src/ImageTab.test.tsx` and `web/src/MarkdownTab.test.tsx` verify Split is inside the metadata action container.
- `web/src/PageTab.test.tsx` verifies navigation and tab actions share the right-side container after the address.

## Out of scope

- Changing what any metadata button does, when it appears, or which icon it uses.
- Moving non-header controls such as monitor suggestion ratings or editor inline-diff actions.
- Changing tab-strip buttons, dialogs, or command-bar controls.
