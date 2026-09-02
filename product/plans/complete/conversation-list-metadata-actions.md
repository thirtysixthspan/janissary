# Fix: align conversation-list metadata actions

**Complexity: 2/10** — the change stays inside the existing conversation-list header, its focused client test, shared chat styling, and the conversation behavior spec. It reuses the plugin metadata and action classes already used by conversation, agent, and harness tabs and requires no server, protocol, or plugin-contract work.

## Goal

Make the conversation-list metadata row match other tab metadata rows. Remove the redundant **Conversations** label, place the new-conversation control in the right-aligned action group, and render it as a plus icon with an accessible tooltip instead of a labeled content button.

## Approach

Keep the existing plugin-owned metadata row and shared `plugin-actions` group. Move the existing `create` intent button into that group ahead of the host-provided split action, retain the Font Awesome plus glyph, and identify the icon-only control with the tooltip `New conversation`.

Remove the standalone `chat-new` styling because the control will inherit the same metadata-action styling as the other plugin header buttons. Keep the empty state and conversation rows immediately below the header.

## Implementation steps

1. Update `web/src/plugins/chat/ConversationList.tsx` and `web/src/plugins/chat/chat.css` so the metadata row contains only the right-aligned icon actions and the standalone labeled new-conversation control is removed.
2. Run `./scripts/run.mjs check-diff` and resolve any failures.
3. Update `web/src/plugins/chat/ConversationList.test.tsx` to cover the icon action's placement, accessible label, create intent, and absence of the redundant heading.
4. Run `./scripts/run.mjs check-diff` and resolve any failures.
5. Update `product/specs/conversations.md` to describe the icon action in the metadata row.
6. Check `help.md` and `documentation/user-documentation/` for existing conversation-list header guidance, update it only if present, then run `./scripts/run.mjs check-diff`.

## Tests

- The conversation list does not render a redundant `Conversations` heading in its metadata row.
- The metadata action group contains an icon-only **New conversation** button before the split control.
- Clicking the icon emits the existing `create` intent with an empty payload.
- The empty-list message remains visible.

## Out of scope

- Conversation row navigation or opening behavior.
- Conversation-tab model and workspace actions.
- Server intents, conversation persistence, or plugin API changes.
- General metadata-row styling outside the chat plugin.

## Verification

- `./scripts/run.mjs check-diff` passes after implementation, tests, and spec updates.
- PR #952 remains open and receives the completed commit on `feature/conversations-plugin`.
