# Rename a conversation by double-clicking its title

**Complexity: 5/10** — one new intent following the seven already there, one manager method following `selectModel` line for line, a small title component, and one published UI primitive. The only judgment calls are what an explicit rename does to the automatic one, and what a cancelled reply may restore.

A conversation's title is set once, by its first query, and never again: `New conversation` until then, the first line of the first query capped at 60 characters afterwards, and nothing the user can do about either. The title shows in the conversation tab's metadata row, on the tab itself, and in the conversation list — all three from the same stored string, so a way to change that string reaches all three at once.

Renaming a tab is already a solved interaction here: double-click the name, an inline field replaces it with the text selected, Enter or a click away commits, Escape cancels. `web/src/InlineEditInput.tsx` is that field, and it is already generic — className, value, and three callbacks, no knowledge of tabs. This gives the conversation title the same interaction from the same component.

## Approach

**The intent.** `rename` joins the seven intents `activate.ts` already dispatches, guarded by `isRenameIntent` beside its siblings in `shared.ts`, and maps to a `{ topic: 'conversations'; action: 'rename'; id; title }` topic action. `runTopicAction` routes it to `ConversationsManager.rename`, which follows `selectModel` exactly: refuse an unknown id, set the field, persist only when the conversation has turns, then `changed()`. Nothing new is invented on the path from click to store.

**Persisting only a conversation that already exists on disk** is `selectModel`'s rule, and keeping it means a rename does not quietly create the directory that a first query or a workspace control is documented to create. The renamed title still reaches the tab, the metadata row, and the list immediately, because all three read the in-memory record; it simply is not written until the conversation is written for a reason it already had.

**An explicit rename beats the automatic one.** Today the first query titles the conversation whenever there are no turns yet. Rename a brand-new conversation and that first query would overwrite the name a moment later. The guard gains a second condition: the first query names a conversation *that still has its default name*. `New conversation` becomes a named constant in `view.ts` — it is currently written out three times, once as `create`'s initial value and once as `conversationTitle`'s own fallback — and the guard compares against it. No new persisted field, so no schema version bump.

**A cancelled reply may only restore a title it set.** `ConversationResponder` snapshots the title before every send and restores it on cancel, which is how a cancelled first query gives `New conversation` back. Rename mid-reply and that snapshot restores the old name over the new one. So the snapshot becomes conditional: recorded only when the responder is about to auto-title, restored only when recorded. A cancel then puts back exactly what the cancel undid, which is what it was always meant to do.

**Publishing the field.** A client tab plugin may import only `../api`, so `InlineEditInput` is re-exported from `web/src/plugins/api.ts` — the same route `renderMarkdown` and the command bar take, and additive, so `TAB_PLUGIN_API_VERSION` does not move.

**A title component of its own.** `ConversationTitle.tsx` beside `ConversationTab.tsx`, holding the editing flag, the draft, and the cancel-then-blur guard `TabItem` needs for the same reason: Escape blurs the field, and the blur must not also commit. It caps the draft at the 60 characters an automatic title is capped at, so a renamed conversation cannot hold a title the first query could not have produced. An empty or whitespace-only commit cancels rather than clearing the name. Renaming is refused once the conversation is deleted, like every other control in that row.

## Implementation steps

1. `src/conversations/view.ts` — export `DEFAULT_CONVERSATION_TITLE` and use it as `conversationTitle`'s fallback.
2. `src/conversations/manager.ts` — use the constant in `create`; add `rename(id, title)` modeled on `selectModel`.
3. `src/conversations/responder.ts` — auto-title only a conversation still holding the default title; make the title snapshot and its restore conditional on that.
4. `src/plugins/api.ts` — add the `rename` topic action to `TabPluginTopicAction`.
5. `src/plugins/topics.ts` — route it to `managers.conversations.rename`.
6. `src/plugins/conversations/shared.ts` — `isRenameIntent`.
7. `src/plugins/conversations/activate.ts` — the `rename` case, beside `select-model`.
8. `web/src/plugins/api.ts` — re-export `InlineEditInput`.
9. `web/src/plugins/conversations/ConversationTitle.tsx` — the double-click-to-edit title.
10. `web/src/plugins/conversations/ConversationTab.tsx` — render it in place of the plain name span, emitting the `rename` intent.
11. `web/src/plugins/conversations/conversations.css` — style the rename field to sit where the title does, so the row does not jump when editing starts.
12. `product/specs/conversations.md` — the rename interaction and what it does to the automatic title.
13. `product/specs/tab-plugins.md` — the field added to the client API surface.

## Tests

- `src/conversations/manager.test.ts` (extended): renames a conversation and reports it through `view()`; persists a rename for a conversation with turns; leaves an empty conversation unwritten; refuses an unknown id.
- `src/conversations/store.test.ts` or `manager.test.ts` (extended): a first query titles a conversation still holding the default title, and leaves a renamed one alone.
- `src/conversations/manager.test.ts` (extended): cancelling a first query restores `New conversation`; cancelling a reply to a conversation renamed mid-flight keeps the new name.
- `src/plugins/conversations/activate.test.ts` (extended): a `rename` intent raises the topic action with the id and title; a malformed payload is rejected; a `rename` on the list tab is rejected.
- `src/plugins/topics.test.ts` (extended): the `rename` action reaches `managers.conversations.rename`.
- `web/src/plugins/conversations/ConversationTitle.test.tsx` (new): double-click opens the field with the current title selected; Enter commits the new title; blur commits; Escape cancels and commits nothing; an empty or whitespace commit changes nothing; the draft is capped at 60 characters; a deleted conversation does not open the field.
- `web/src/plugins/conversations/ConversationTab.test.tsx` (extended): committing a rename emits the `rename` intent with the new title.

## Out of scope

- **Renaming from the conversation list.** The issue names the tab's metadata row, and the list's rows already carry a two-click open gesture that a double-click-to-rename would collide with. Worth doing, worth designing separately.
- **Deduplicating `web/src/plugins/page/PageAddressInput.tsx`.** It is a hand-rolled near-copy of `InlineEditInput` that exists only because the plugin boundary blocked reuse, and publishing the original makes removing it possible — but that is a change to the page plugin, which this fix does not otherwise touch.
- **Renaming the tab and the conversation independently.** A conversation tab's title comes from the conversation, and this keeps it that way; a tab rename that diverged from the conversation's name would be a second source of truth for the same string.
- **A schema version bump or a stored "user named this" flag.** The default-title comparison answers the same question without one.
- **The 60-character cap itself**, and what a longer paste does — the cap is what an automatic title already applies, and this matches it rather than reopening it.
- **User documentation.** No page in `documentation/user-documentation/` describes conversation titles, and this task does not add documentation for previously undocumented behavior.

## Verification

Automated: `./scripts/run.mjs check-diff` after each step.

Manual: open a conversation, double-click its title, type a new name, press Enter, and confirm the tab, the metadata row, and the conversation list all show it; then send a first query and confirm the name survives.
