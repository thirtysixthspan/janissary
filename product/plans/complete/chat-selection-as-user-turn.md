# Chat selections render as user turns and persist after sending

## Complexity

4/10

## Goal

Per the resolved backlog entry: the selected text a conversation opens with (the `Chat about this` selection) should not be set apart from the conversation as a labelled context block; it should look like conversation submitted by the user — a user turn with no response from the model — and it should not disappear from the conversation after a query is submitted.

## Approach

- **Client (`web/src/plugins/conversations/ConversationTab.tsx`)**: drop the labelled `conversation-context` block; render the draft inside the `.conversation-turns` area, above the real turns, as a `conversation-turn` whose only content is a `conversation-query` div — the same user-message styling real turns use, with no response and no pair row.
- **Server (`src/plugins/conversations/tabs.ts`)**: the draft no longer leaves the tab payload when consumed. The first send still carries it as model context (a later send is an ordinary query, as documented in `product/specs/conversations.md`), so `ConversationTabs` gains a `forwarded` set that remembers which tab's draft has already been carried; the draft itself stays in the payload and keeps rendering until the tab is closed or its conversation is reopened from the list, which discard it as before.
- **CSS (`web/src/plugins/conversations/conversations.css`)**: remove the now-unused `.conversation-context*` rules; no new rules — the draft borrows existing turn styling.

## Implementation steps

1. `tabs.ts`: replace `consume` with `contextFor(id, capabilities)` that marks the draft forwarded instead of deleting it; never republishes a payload for consumption. Prune `forwarded` alongside `drafts` in `update`, `open`, and `dispose`.
2. `ConversationTab.tsx`: move the draft rendering into the turns area as a user-style turn; update the comment.
3. `conversations.css`: remove the `.conversation-context` rules.

## Tests

- `src/plugins/conversations/activate.test.ts`: first send carries the draft as context and the payload keeps it; a second send is an ordinary query; notification and reopen semantics unchanged.
- `web/src/plugins/conversations/ConversationTab.test.tsx`: the selection renders as a user-style turn (no "Selected text" label, no response) and persists while the payload keeps it.
- `web/src/plugins/PluginTabLayer.test.tsx`: update the retained-draft selector to the new markup.

## Out of scope

- The remembered last-used model pair.
- Whether the selection reaches the model on sends after the first (documented behavior stands: only the first).
- The context-menu plugin contract and specs.
