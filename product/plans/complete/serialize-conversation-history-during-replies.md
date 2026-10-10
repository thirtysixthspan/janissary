# Serialize completed conversation history during replies

**Complexity: 5/10** — filter transient turns from stored snapshots, check record existence explicitly, and update the conversation persistence tests.

## Goal

Keep saved conversation records readable when a title or model changes while a reply is streaming, without persisting a partial turn.

## Approach

Have `ConversationStore` write a durable snapshot that excludes streaming turns and expose a record-existence check that tests for the conversation file itself. Use that check for metadata writes so a pending first query does not create a record accidentally, while previously saved conversations still persist metadata and workspace controls can still explicitly save an empty conversation.

## Implementation steps

1. Add a durable snapshot serializer and `hasRecord` check to `src/conversations/store.ts`; use the check for rename and model selection in `src/conversations/manager.ts`.
2. Update `src/conversations/manager.test.ts` and `src/conversations/store.test.ts` for pending-turn metadata writes, persisted completed history, cancellation or disposal, and explicit empty records.
3. Update `product/specs/conversations.md` to specify the durable history behavior.

## Tests

- Renaming during a streamed response does not put the partial turn on disk.
- Existing completed history remains readable after a rename during a later response, including after cancellation or disposal.
- Renaming a first pending turn does not create a record; a workspace action still persists an empty conversation.

## Out of scope

- Persisting partial responses on cancellation or shutdown.
- Changing the conversation record schema or workspace lifecycle.
