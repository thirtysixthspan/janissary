# Create a conversation from the conversation list with Cmd+N

**Complexity: 2/10** — the server-side create intent already creates and opens a conversation tab, so the change is one client keyboard route, focused interaction tests, and a concise spec update.

## Goal

Pressing `Cmd+N` while the conversation list has keyboard focus should create a new conversation and open its `New conversation` tab. `Ctrl+N` should provide the same behavior on non-macOS platforms.

## Approach

Keep creation on the chat plugin's existing `create` intent so the header button and keyboard shortcut share the same server-owned behavior. The conversation list's local key handler will recognize the unshifted, unaltered Cmd/Ctrl chord, prevent the browser default, stop the event from reaching the window handler, and send that intent.

## Implementation steps

1. Update `web/src/plugins/chat/ConversationList.tsx` so the header button and `Cmd+N`/`Ctrl+N` shortcut call one local create function, with the keyboard route consuming the handled event.
2. Run `./scripts/run.mjs check-diff` and resolve any failures.
3. Add focused interaction coverage in `web/src/plugins/chat/ConversationList.test.tsx` for both platform chords and event consumption.
4. Run `./scripts/run.mjs check-diff` and resolve any failures.
5. Update `product/specs/conversations.md` to describe the new conversation-list shortcut.
6. Run `./scripts/run.mjs check-diff` and resolve any failures.

## Tests

- Pressing `Cmd+N` on the focused conversation list sends the existing `create` intent and prevents the browser default.
- Pressing `Ctrl+N` on the focused conversation list sends the same `create` intent and prevents the browser default.

## Out of scope

- Changing the server-side conversation creation or tab-opening flow.
- Adding a global `Cmd+N` action outside the conversation list.
- Renaming the bundled `chat` plugin or its command.
- Changing the conversation tab input.

## Verification

- `./scripts/run.mjs check-diff` passes after implementation, tests, and the spec update.
