# Fix: float the conversation model selector to the right

**Complexity: 2/10** — the change stays inside the conversation tab's metadata row, its colocated client test, the conversations stylesheet and its style test, and the conversations spec. No server, protocol, or plugin-contract work.

## Goal

Move the conversation tab's model selector out of its position beside the title and into the right-aligned action group, so it sits next to the folder, new-agent, and split controls in the metadata row instead of floating in the middle of the row.

## Approach

The metadata row is a `.plugin-meta` flex row whose `.plugin-actions` group already carries `margin-left: auto` and holds the right-aligned controls. Render the model `<select>` as the first child of that group, ahead of the folder button, the same way the conversation list's **New conversation** action was moved into its own action group.

The shared `.plugin-actions` gap of 2px is meant for adjacent icon buttons and would jam the select against the folder icon, so the conversation header widens its own group's gap and keeps the existing `max-width` cap on the select.

## Implementation steps

1. **`web/src/plugins/conversations/ConversationTab.tsx`** — move the model `<select>` element inside the `<span className="plugin-actions">`, before the folder button. Nothing about its value, disabled state, or `select-model` intent changes.
2. Run `./scripts/run.mjs check-diff` and resolve any failures.
3. **`web/src/plugins/conversations/conversations.css`** — scope the select's `max-width` to the action group and widen that group's gap so the select reads as a separate control from the icon buttons.
4. Run `./scripts/run.mjs check-diff` and resolve any failures.
5. **`web/src/plugins/conversations/ConversationTab.test.tsx`** — assert the select is inside the metadata action group and precedes the workspace buttons.
6. **`web/src/plugins/conversations/conversations-style.test.ts`** — assert the conversation header's action group gives the select its own spacing and width cap.
7. Run `./scripts/run.mjs check-diff` and resolve any failures.
8. **`product/specs/conversations.md`** — say where the model selector sits in the metadata row.
9. Check `help.md` and `documentation/user-documentation/` for existing conversation-header guidance and update it only if it already describes the selector's placement.

## Tests

- The model selector renders inside the metadata row's `.plugin-actions` group.
- The selector appears before the folder and new-agent buttons within that group.
- Changing the selector still emits the `select-model` intent with the chosen harness and model.
- The conversations stylesheet caps the selector's width and spaces it from the icon buttons inside the conversation header's action group.

## Out of scope

- The conversation list's metadata row, which has no model selector.
- Model grouping, catalogue contents, or what a model change does to the agent session.
- The metadata rows of other plugin tabs, which share `.plugin-actions` styling.
- Conversation tab padding, which is a separate backlog item.
