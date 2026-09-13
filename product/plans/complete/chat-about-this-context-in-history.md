# Chat about this — selection as conversation context, not composer text

**Complexity: 5/10** — the draft pipeline (tab payload, lifetime, consume-on-send) already exists from the parent feature; this re-points where it renders and where it goes on send. It touches the plugin topic action for `send`, the conversation manager/responder/prompt builder, and two web components with their tests, but introduces no new lifecycle or storage.

Backlog text: *"when the chat about this is selected, the selected text should go into the conversation history instead of the command line. The selected text should only act as additional context for the prompt to the model once the user submits a prompt. A call to the model should not be immediately sent when the conversation is opened."*

The goal: activating **Chat about this** still opens a brand-new conversation tab on the last-used pair with nothing sent, but the selected text now appears in the conversation itself — a context block in the history area above the turns — while the composer stays empty. Nothing reaches the model until the user types a prompt and presses Enter; that one send carries the selection along as additional context. After it, the block disappears and the conversation behaves exactly as before.

## Design decisions established by the feature text or existing behavior

**The draft never becomes stored conversation content.** It keeps riding the tab payload as optional `draftQuery` (`src/plugins/conversations/shared.ts`), validated as before; the conversation record, the window view, and `ConversationTurn` are untouched. Closing the tab unsent still simply loses the draft, through the existing notification-prune and reopen-discard paths in `ConversationTabs`.

**The draft is consumed by the first send and by nothing else.** The old client-side mount acknowledgement (`consume-draft` intent, composer's `pendingAcknowledgement`/`onConsumeDraft`) softens to: the draft is cleared when the send intent is raised with the draft as context, or when the tab closes/reopens via the paths that already exist. The `consume-draft` intent becomes unreachable and is removed; `ConversationTabs.consume` gains a returning form used by the send path.

**The context reaches the model only in the prompt text, with no schema change.** The `conversations` `send` topic action gains an optional `context: string`; `ConversationsManager.send` and `ConversationResponder.send` pass it through, and `conversationPrompt` (`src/conversations/view.ts`) prepends a clearly labelled selected-text section ahead of the turn replay when one is present. A session that already exists replays its own history natively — the context is prepended to the query text itself in that case too, so it arrives wherever the session is fresh or not.

**Naming is unchanged.** The first submitted query — the composer text, not the selection — names the conversation, because naming reads the query as it already does.

**The composer starts empty.** `ConversationComposer` loses `initialQuery` and `onConsumeDraft`; it is a plain input again. The draft block renders in the conversation history area (labelled selected text, its content verbatim) above the turns. Escape still clears only composer text.

## Proposed changes

1. `src/plugins/api.ts` — `send` topic action gains optional `context: string`.
2. `src/plugins/topics.ts` — `send` passes `action.context` through to `managers.conversations.send`.
3. `src/conversations/manager.ts` — `send(id, query, context?)` threads to the responder.
4. `src/conversations/responder.ts` — `send(conversation, query, context?)`; passes context into the prompt composition for both the fresh and replayed-session cases.
5. `src/conversations/view.ts` — `conversationPrompt(query, turns, context?)` prepends a `Selected text for context:` section (the verbatim selection) before the replay.
6. `src/plugins/conversations/tabs.ts` — `consume` returns the draft it removed; minor rename awareness elsewhere.
7. `src/plugins/conversations/activate.ts` — `send` intent consumes the draft first, includes it as `context` on the send topic action when present; the `consume-draft` intent case is removed.
8. `web/src/plugins/conversations/ConversationComposer.tsx` — drop `initialQuery`/`onConsumeDraft` and the acknowledgement effect.
9. `web/src/plugins/conversations/ConversationTab.tsx` — render `payload.draftQuery` as a labelled context block in the history area; composer receives no draft.
10. Spec: `product/specs/conversations.md` — the chat-from-selection paragraph now describes a context block in the conversation history consumed as model context by the first prompt; the composer starts empty.

## Out of scope

- No change to Copy, the default menu, terminal bridging, or the remembered model pair.
- No schema version bump or persisted-state change; the draft never enters `ConversationStore`.
- No editing of the PR title.

## Tests

Mirror existing styles:

- `src/plugins/conversations/activate.test.ts` — send with a draft emits the send topic action carrying `context: <draft>`; without a draft it emits no context; the `consume-draft` intent resolves as unknown/removed; draft lifetime tests keep holding (consume-on-send still clears the payload).
- `src/plugins/topics.test.ts` — send forwards the optional context to the manager; omission works as before.
- `src/conversations/view.ts` tests? conversationPrompt has no dedicated test file — cover context composition inside `src/conversations/manager.test.ts`-adjacent responder coverage if one exists; otherwise assert prompt construction via manager/responder tests where they already exist. Check and place accordingly.
- `web/src/plugins/conversations/ConversationTab.test.tsx` — a payload with `draftQuery` renders the selected text in the history area, the composer starts empty, and no `consume-draft` intent is raised; the first send clears it and still sends the composer text.
- `web/src/plugins/conversations/ConversationComposer.test.tsx` — draft-acknowledgement tests removed; Escape still clears typed text.
- `web/src/plugins/PluginTabLayer.test.tsx` — payload validation cases survive unchanged.
