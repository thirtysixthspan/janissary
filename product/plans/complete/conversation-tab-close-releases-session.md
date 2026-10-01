# Release a closed conversation tab's ACP session and window

**Complexity: 3/10** — one method in `ConversationsManager` (`src/conversations/manager.ts`) widens what it releases, plus an `ids()` accessor on `ConversationSessions` (`src/conversations/sessions.ts`). No new architecture.

`ConversationsManager` notices a closed tab through its `tab:removed` subscription and, on a queued turn, ran `cancelClosedConversations`, which walked only `responder.ids()` — the in-flight replies. A finished reply deliberately keeps its `ConversationSessions` entry alive for the next turn, and `windowSizes` was cleared only by `delete`, so a conversation tab closed while idle left its `opencode acp` subprocess running until shutdown and its window in every `conversations` view broadcast. `product/specs/conversations.md` already says a closed conversation tab ends the session.

## Goal

When no open tab shows a conversation, its in-flight reply is cancelled, its live ACP session is ended, and its window stops being sent. A conversation still shown in some tab is untouched. Reopening a released conversation loads it again (`load` sets its window) and its next query starts a fresh session, replaying recent turns as after any ended session.

## Approach

1. `ConversationSessions.ids()` returns the ids holding a session.
2. `ConversationsManager` keeps the `ConversationSessions` it was given as a field, and `releaseClosedConversations` (renamed from `cancelClosedConversations`) walks the union of window, in-flight, and session ids; for each with no open conversations tab it calls `cancel(id)` — which ends the session whether or not a reply is in flight — and drops the window entry, emitting `changed` once if any window was dropped.

The in-memory conversation record is left as is; it is a cache of the store that `get` reloads.

## Implementation steps

1. Add `ids()` to `ConversationSessions`.
2. Rewrite the release method in `ConversationsManager`.
3. Add tests; run `./scripts/run.mjs check-diff`.

## Tests

In `src/conversations/manager.test.ts`, "when a conversation tab closes":

- Existing: the in-flight reply is cancelled; an open tab keeps its conversation.
- New: an idle conversation's session is killed when its tab is gone.
- New: its window leaves `view().windows` and a `conversations` change is emitted.
- New: a conversation still open in a tab keeps its session and window.

## Out of scope

- Moving the release into the `MANAGER_TAB_RELEASE` walk; the conversations tab is a plugin tab keyed by instance, and the bus subscription is how the manager learns of it today.
- Dropping a never-sent conversation's in-memory record from the summaries list once its tab closes.

Spec: none changed — `product/specs/conversations.md` already states that closing a conversation tab ends its session.
