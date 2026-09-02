# Fix: make the conversation list's current row visible and its second click the one that opens

**Complexity: 3/10** — the change stays inside the conversation list component, its pure selection helper, the chat stylesheet, their colocated tests, and the conversation spec. No server, protocol, or plugin-contract work is involved.

## Goal

Give the conversation list a current row a user can actually see, and make every single click move the current row rather than open a conversation, so that opening with the mouse always takes a second click.

## Approach

The list already tracks a current index, moves it with Up, Down, Home, and End, and opens the current conversation with Enter. Two things defeat that in the running application.

The current row is invisible. The rule that highlights it paints hover and the current row with the same background, so once the pointer is anywhere over the list there is no way to tell which row Enter would open. The current row instead takes the treatment the file navigator's cursor row uses — a soft background plus an accent bar down its leading edge — while hover keeps only the soft background. The focused list also drops the browser's focus ring around the whole box, the way the file-navigator tree does, so the row highlight is the one thing marking position.

The second defect is that opening with the mouse does not always take two clicks. A click opens whenever the clicked row is already current, and the first row is current from the moment the list opens, so a single click on the top row opens it. The same happens on any row reached with the arrow keys. The component instead remembers which row a pointer last made current, and opens only when a click lands on that same row. Moving with the keyboard clears that memory, so a keyboard-selected row still takes its own two clicks. Enter is unaffected and stays the one-key way to open the current row.

Both rules are pure index arithmetic, so they go into `chat-keys.ts` beside `nextChatSelection` and are tested without rendering.

## Implementation steps

1. Add a pure `chatClickSelection` helper to `web/src/plugins/chat/chat-keys.ts` that maps a clicked index and the pointer-confirmed index to the next current row and whether the click opens.
2. Run `./scripts/run.mjs check-diff` and resolve any failures.
3. Update `web/src/plugins/chat/ConversationList.tsx` to hold the pointer-confirmed index, drive clicks through the helper, and clear the confirmation on keyboard movement.
4. Run `./scripts/run.mjs check-diff` and resolve any failures.
5. Update `web/src/plugins/chat/chat.css` so the current row is distinguishable from a hovered row and the focused list shows no outline of its own.
6. Run `./scripts/run.mjs check-diff` and resolve any failures.
7. Add `web/src/plugins/chat/chat-keys.test.ts`, which the helpers do not yet have, and extend `web/src/plugins/chat/ConversationList.test.tsx` and `web/src/plugins/chat/chat-style.test.ts` with the cases below.
8. Run `./scripts/run.mjs check-diff` and resolve any failures.
9. Update `product/specs/conversations.md` to state that a single click only ever moves the current row.
10. Check `help.md` and `documentation/user-documentation/` for existing conversation-list navigation guidance, update it only if present, then run `./scripts/run.mjs check-diff`.

## Tests

- `chatClickSelection` opens only when the clicked row is the row a pointer already made current, and otherwise reports the clicked row as the new current row.
- A single click on the first row, which is current when the list opens, moves the current row without opening it; the second click opens it.
- A row reached with the arrow keys takes two clicks to open, because keyboard movement clears the pointer confirmation.
- A click on one row followed by a click on a different row opens neither.
- Enter still opens the current row after arrow-key movement.
- The current row and a hovered row are painted differently, and the focused list draws no outline of its own.

## Out of scope

- Wrapping arrow-key movement past the ends of the list.
- Any change to the metadata row, its actions, or the delete confirmation.
- The conversation tab's own turns, composer, and model selector.
- Server intents, conversation persistence, and plugin API changes.

## Verification

- `./scripts/run.mjs check-diff` passes after implementation, tests, and spec updates.
- PR #952 remains open and receives the completed commit on `feature/conversations-plugin`.
