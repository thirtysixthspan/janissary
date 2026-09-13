# Clear the Chat about this draft with Escape

**Complexity: 3/10** — one client component, its focused test, and the conversations behavior spec.

## Goal

Pressing Escape in an idle conversation tab clears the unsent text in its message input, including the draft inserted by **Chat about this**.

## Approach

Handle Escape in the conversation composer before the shared command-bar key handler. The existing conversation-tab window handler remains responsible for Escape while a reply streams, so cancellation behavior does not change.

## Implementation steps

1. Clear the composer value and prevent the browser's default Escape behavior when the composer receives Escape while no reply is streaming.
2. Add a composer test that starts with a Chat about this draft and verifies Escape clears it without submitting.
3. Document the idle Escape behavior in the conversations spec.

## Tests

- `web/src/plugins/conversations/ConversationComposer.test.tsx`: Escape clears an unsent initial draft and does not send a query.

## Out of scope

- Changing Escape while a conversation reply is streaming, which continues to cancel the reply.
- Adding Escape behavior to other command bars.
