# Recover editor drafts after reconnecting

Complexity: 5/10 (threshold: 7).

## Goal

Restore the current editor draft to the server after a connection interruption without requiring another edit or replaying mutating commands.

## Approach

An editor-owned, framework-free coordinator keeps desired content separate from acknowledged content. It debounces updates, allows one outstanding draft per connection generation, and resends the current snapshot after reconnecting. The hook owns transport subscription and teardown. Replacing a URL or client invalidates prior acknowledgements while preserving the latest draft.

## Implementation steps

1. Add `web/src/editor/draft-sync.ts` with attach/detach, text-update, and connection-state operations plus lifecycle and acknowledgement tests. Change `JanusClient.editorSync` in `web/src/ws.ts` to use the existing acknowledged request transport, and adapt `web/src/editor/useEditorSync.ts` to the coordinator. Update the client fakes in `web/src/editor/EditorTab.test.tsx`, `web/src/editor/EditorTab.window-keys.test.tsx`, and `web/src/useSectionNav.editor.test.tsx` for the subscription and acknowledgement contract. Update comments that describe this path as fire-and-forget. Run `./scripts/run.mjs check-diff`.
2. Extend `web/src/editor/useEditorSync.test.ts` and `web/src/ws.test.ts` for reconnect without typing, acknowledgement failure, pending edits, stale acknowledgements, URL/client replacement, and cleanup; retain initial-load and cursor-only suppression. Use narrow lint comments for ES2023-compatible deferred promises where needed. Run `./scripts/run.mjs check-diff`.
3. Correct the live draft section of `product/specs/editor-tab.md` and the existing monitor-draft description in `documentation/user-documentation/tab-types/editor.md`. No help command changes are needed. Remove the resolved entry, complete this plan, and run `./scripts/run.mjs check-diff`.
4. Ship through `ai/tasks/workspace/merge-change-to-master.md` and confirm ready and development are empty on master.

## Tests

Prove a failed or interrupted draft is resent after reconnect without another edit; rapid edits coalesce; an acknowledged older snapshot cannot mark newer text delivered; stale results after disconnect, target replacement, or detach are ignored; an obsolete URL receives no queued update; unmount releases the timer and connection listener; unchanged initial text and cursor moves send nothing. Verify `editorSync` waits for the RPC reply and reports failure on disconnect. Preserve the generic client's no-command-replay test and existing editor and monitor behavior.

## Out of scope

Generic transport replay, persistence across application restart, multiple-client draft arbitration, disk-save changes, server protocol changes, and deferred backlog entries.
