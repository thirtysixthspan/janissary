# Contain conversation storage failures

**Complexity: 6/10** — add recovery around conversation response startup and persistence, surface failures through notifications or the turn, and extend the focused manager tests.

## Goal

Keep a storage failure from stranding a conversation response or escaping an ACP callback, while showing the user what could not be saved.

## Approach

Make `ConversationResponder` own rollback and terminal persistence recovery. If workspace/session startup throws, restore the conversation's prior turn, title, and timestamp, release the in-flight entry and session, notify through a reporter supplied by `ConversationsManager`, and broadcast the changed state. If writing a completed or failed turn throws, keep the terminal turn in memory and attach a clear persistence error without retrying the same writer. Always settle timers and in-flight state before reporting.

## Implementation steps

1. Add startup rollback and terminal write recovery in `src/conversations/responder.ts`, with a storage-error reporter injected by `src/conversations/manager.ts`.
2. Extend `src/conversations/manager.test.ts` for failed workspace startup, failed completion persistence, and failed persistence from an ACP connection error, including a later successful send.
3. Update `product/specs/conversations.md` with the response and storage-failure behavior.

## Tests

- Failed workspace setup restores conversation state, clears pending state, reports the error, and permits another send.
- A failed completion write retains the complete response with a persistence error and clears streaming state.
- A failed write from an ACP error callback is contained, reported, and does not prevent a later send.

## Out of scope

- Changing the conversation file format or retrying failed writes automatically.
- Changing ordinary rename, model selection, or workspace persistence behavior.
