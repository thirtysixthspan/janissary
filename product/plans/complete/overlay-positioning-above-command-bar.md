# Position tab pickers above the command bar

**Complexity: 5/10** — The shared picker styles currently anchor to the wrong box when host overlays render beside a plugin body. The fix touches picker CSS, the plugin tab frame, related rendering coverage, and the keyboard-navigation spec.

## Goal

Keep the history, clipboard, queue, tab navigation, Quick Open, application-theme, and syntax-theme popups above the command bar and inside the tab's colored left edge, including when a shell tab is open.

## Approach

Use the host-owned tab body as the containing block for sibling overlays. Position those popups above the command bar and inset them past the tab border. Leave pickers rendered inside an agent tab's `.main` in their existing position.

## Implementation

1. Make plugin tab bodies positioned containers and adjust direct-child picker overlays to sit above the command bar and inside the colored left edge.
2. Add focused rendering/style coverage for the affected plugin-tab overlays and preserve the agent-tab picker placement.
3. Update the keyboard-navigation spec with the shared placement behavior.

## Tests

- Assert the picker overlay placement rules cover the host tab body while ordinary agent-body pickers remain nested in `.main`.
- Run the diff-scoped lint, typecheck, and related web tests.

## Out of scope

- Changing picker contents, keyboard behavior, or overlay priority.
- Repositioning unrelated dialogs, file navigator popups, or status panels.
