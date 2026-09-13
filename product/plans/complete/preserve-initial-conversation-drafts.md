# Preserve initial conversation drafts

## Complexity

5/10. The fix spans the existing conversation activation and composer lifecycle, without changing the host API or durable conversation storage.

## Goal

Preserve the selected draft when conversation updates arrive before the new composer mounts.

## Approach

Keep pending initial drafts in transient state owned by the conversations plugin activation, keyed by conversation instance. Extract conversation tab creation, opening, payload generation, and draft lifetime into `src/plugins/conversations/tabs.ts` to keep the activation below the 200-line limit. Store a draft inside the new-tab factory, after the create action's notifications, and preserve it in subsequent notifications until acknowledged. This uses the existing plugin capabilities; it adds no state to the controller or ConversationStore.

The composer retains its one-time state initializer and acknowledges a captured initial draft through a callback wired by ConversationTab to an empty `consume-draft` intent. Validate that intent only for conversation tabs. Clear both retained state and the published initial draft on acknowledgement or a valid send. Opening an existing tab preserves a pending draft; opening a closed conversation discards it inside the new-tab factory. Prune closed instance keys on conversation notifications and release all pending drafts on plugin disposal.

## Implementation steps

1. Extract the tab lifecycle helper, retain pending drafts through notifications, and wire validated consumption, send cleanup, reopen cleanup, and disposal into `src/plugins/conversations/activate.ts`. Run `./scripts/run.mjs check-diff`.
2. Add the composer acknowledgement callback and connect it to the plugin intent in `web/src/plugins/conversations/ConversationTab.tsx`, preserving edited text and one-time initialization. Run `./scripts/run.mjs check-diff`.
3. Add the regression coverage below and run `./scripts/run.mjs check-diff`.
4. Update `product/specs/conversations.md` with delayed-mount retention and one-time consumption behavior. Help and public documentation do not currently describe Chat about this, so no additions are needed there. Promote this plan, remove only the resolved PR backlog entry, run the final diff checks, and commit and push to the existing open PR.

## Tests

- `src/plugins/conversations/activate.test.ts`: create two draft conversations and notify before either composer acknowledges; verify each draft remains distinct and unsent. Verify acknowledgement removes only its own draft from immediate and subsequent payloads and is idempotent. Reject malformed acknowledgements and list-tab acknowledgements without clearing drafts. Verify valid send clears a pending draft, while invalid send does not. Cover close/reopen through list and command paths, preserving drafts on focus of already-open tabs, pruning closed keys, and disposal.
- `web/src/plugins/conversations/ConversationComposer.test.tsx`: acknowledge only a captured initial draft after mount, once even with changed callback identity or StrictMode effects; absence of a draft causes no acknowledgement. Payload changes and acknowledgement leave edited text intact.
- `web/src/plugins/conversations/ConversationTab.test.tsx`: verify the captured draft produces the empty consumption intent without sending, and removing the initial draft from later payloads preserves edits.
- `web/src/plugins/PluginTabLayer.test.tsx`: use the existing controlled lazy-loader fixture with the real conversation client entry. Deliver a draft snapshot, replace it with a newer draft-preserving snapshot before resolving the loader, and verify the latest conversation details and original selection appear, with acknowledgement but no send.

## Out of scope

Draft persistence, host lifecycle APIs, model selection, menu selection identity, other PR backlog entries, PR description changes, and merging the PR. The delayed-loader test uses the fixture's existing lint directive explaining that the web target excludes the ES2024 Promise.withResolvers API; no other new code comments are needed.
