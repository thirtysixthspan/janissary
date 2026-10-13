# Conversation Controller Hook

**Complexity: 6/10** — the change extracts feature-local intent shaping and a visibility-gated keyboard effect from one tab component, with focused pure-module and hook tests and no server or plugin-contract changes.

## Goal

Move conversation intent construction, model-pair parsing, older-turn eligibility, and active-stream cancellation out of `ConversationTab` while preserving its rendered behavior and scroll-pinning contract.

## Approach

Add a framework-free `conversation-actions.ts` adapter around the plugin intent function, and add the inverse of `pairValue` to the existing `model-pairs.ts`. A `useConversationController` hook binds those actions to the current payload and capabilities, gates older-turn requests on current `hasOlder`, and owns the Escape listener only while the conversation is active and streaming. `ConversationTab` keeps presentation, composer/title wiring, and `useStickToBottom` unchanged.

## Implementation steps

1. Add model-pair parsing and the framework-free conversation action adapter, with direct tests including model IDs containing colons.
2. Add the controller hook and focused tests for active-stream Escape behavior, listener teardown, and current paging eligibility.
3. Replace intent calls and model parsing in `ConversationTab` with controller callbacks while preserving its public props and existing interactions.
4. Run `./scripts/run.mjs check-diff` after each implementation and test change.
5. Update `product/specs/conversations.md` only where the existing description needs to state active-tab Escape cancellation and paging eligibility. Check `help.md` and `documentation/user-documentation/` for behavior descriptions that need correction.

## Tests

- Adapter tests verify every named action's intent and payload, including first-colon model-pair parsing.
- Hook tests verify inactive streams ignore Escape, active streams cancel, active-to-inactive and unmount transitions remove the listener, and an updated payload with no older turns suppresses paging.
- Existing conversation-tab, composer, and title tests continue to pass; component tests retain model selection, workspace actions, rename, send, cancellation, paging, stream follow-scroll, and viewport preservation coverage.

## Out of scope

- Changing conversation payloads, intent names, transport behavior, or the plugin contract.
- Moving title/composer state or stream-follow scrolling into the controller.
- Changes to conversation creation, storage, or server-side paging.
