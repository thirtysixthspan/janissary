# Conversation responder undo and timer helpers
**Complexity: 3/10** — one production file edited with two private helpers, plus a new direct test file (~25 added lines, 1 file, 4 requirements, 7 scenarios; p=4.51).

## Goal

Fold the duplicated undo-the-send blocks in `ConversationResponder.cancel` and `rollbackStartup`, and the five repeated `clearTimeout` lines, into `undoSend(id, pending)` and `clearTimer(pending)`, and cover the responder directly.

## Approach

1. Add `src/conversations/responder.test.ts` driving `ConversationResponder` with a stub `ConversationSessions` and `ConversationStore`. Cover `send` then `cancel`, `send` where `sessions.session` throws, a rename during streaming that survives a cancel, and the stream timer being cleared on complete, fail, cancel, and dispose.
2. Add `clearTimer(pending)` and `undoSend(id, pending)` (turn removal, conditional title restore, `updatedAt` restore, in-flight delete) and call them from `cancel`, `rollbackStartup`, `complete`, `fail`, and `dispose`.
3. Keep the differences: `cancel` closes the session before the early return, `rollbackStartup` also closes the session and reports the error, `fail` keeps the turn with its error.

## Out of scope

The six-argument constructor. `manager.test.ts` and `sessions.test.ts` stay unchanged.
