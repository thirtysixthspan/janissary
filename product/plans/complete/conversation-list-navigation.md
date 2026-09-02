# Fix: make the conversation list directly navigable

**Complexity: 3/10** — the chat list already has clamped selection arithmetic, scroll-to-selection behavior, and selected-row styling. The fix is limited to completing those interactions in the existing list component, adding focused interaction coverage, and updating the conversation behavior spec. It requires no protocol, server, or plugin-contract changes.

## Goal

Make saved conversations immediately navigable from the keyboard and pointer. The list should always identify a current row when entries exist, move that highlight with Up and Down, open the current conversation with Enter, follow pointer hover, and open a conversation with one click.

## Approach

Keep selection as ephemeral client state because it controls only the current list highlight. Initialize it to the first saved conversation, restore the first row when an empty list gains entries, and clamp it when entries disappear. Focus the list container whenever its plugin view becomes active so its existing key handler works without a preparatory click.

Reuse the current `nextChatSelection` helper for clamped arrow movement. A row's pointer-enter handler makes that row current, while its click handler emits the existing `open` intent immediately. The delete button continues to stop click propagation, so deleting cannot also open the conversation.

## Implementation steps

1. Update `web/src/plugins/chat/ConversationList.tsx` to initialize and maintain a current row, focus the active list, move selection on pointer hover, and open a row on one click instead of double-click.
2. Run `./scripts/run.mjs check-diff` and resolve any failures before adding tests.
3. Extend `web/src/plugins/chat/ConversationList.test.tsx` with coverage for initial focus/highlight, arrow navigation plus Enter, and hover plus single-click opening.
4. Run `./scripts/run.mjs check-diff` and resolve any failures.
5. Update `product/specs/conversations.md` with the list's keyboard and pointer behavior.
6. Run `./scripts/run.mjs check-diff` and resolve any failures.

## Tests

- The active list takes focus and highlights the first saved conversation when it opens.
- Arrow Down and Arrow Up move the highlighted conversation without wrapping, and Enter emits `open` for the current row.
- Pointer hover moves the highlight, and a single row click emits `open` for that conversation.
- Clicking the delete control still opens only the confirmation dialog and never emits `open`.

## Out of scope

- Navigation inside an open conversation tab, including its composer and model picker.
- Type-ahead search, wrapping selection, multi-selection, or conversation reordering.
- Treating **New conversation** as part of the saved-conversation arrow sequence.
- Changes to conversation persistence, server intents, or plugin API contracts.

## Verification

- `./scripts/run.mjs check-diff` passes after each implementation, test, and spec change.
- PR #952 remains open and receives the completed commit on `feature/conversations-plugin`.
