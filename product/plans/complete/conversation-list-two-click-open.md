# Fix: require conversation selection before pointer opening

**Complexity: 2/10** — the list already owns ephemeral current-row state and keyboard opening. The fix changes one pointer interaction in the existing component, replaces its focused interaction test, and corrects the conversation spec without touching server behavior or the plugin contract.

## Goal

Make pointer interaction with saved conversations deliberate. One click on an unselected row should make it current and keep the list open; clicking that current row again should open the conversation. Keyboard users should continue to move the current row with Up and Down and open it with Enter.

## Approach

Remove pointer-hover selection so entering a row cannot silently turn its first click into an open action. In the row click handler, compare the clicked row with the current selection before updating it. Open only when the row was already current; otherwise select it and restore focus to the list for keyboard continuation.

Keep selection view-local, retain clamped arrow navigation and scroll-to-selection behavior, and preserve delete-button propagation blocking so deletion never selects or opens a row.

## Implementation steps

1. Update `web/src/plugins/chat/ConversationList.tsx` so the first click selects an unselected row and a later click on the selected row emits `open`.
2. Run `./scripts/run.mjs check-diff` and resolve any failures.
3. Update `web/src/plugins/chat/ConversationList.test.tsx` to prove the first click only selects, the second click opens, and keyboard opening still works.
4. Run `./scripts/run.mjs check-diff` and resolve any failures.
5. Update `product/specs/conversations.md` with the two-click pointer behavior.
6. Check `help.md` and `documentation/user-documentation/` for existing conversation-list navigation guidance, update it only if present, then run `./scripts/run.mjs check-diff`.

## Tests

- Clicking an unselected saved-conversation row highlights it without emitting `open`.
- Clicking that selected row again emits `open` for its conversation.
- Up and Down remain clamped and Enter opens the current row.
- Clicking Delete continues to open only the confirmation dialog.

## Out of scope

- Double-click timing or pointer-hover highlighting.
- Changes to initial selection, Home/End navigation, or scroll-to-selection behavior.
- Conversation creation, deletion, persistence, or tab content.
- Server intents and plugin API contracts.

## Verification

- `./scripts/run.mjs check-diff` passes after implementation, tests, and spec updates.
- PR #952 remains open and receives the completed commit on `feature/conversations-plugin`.
