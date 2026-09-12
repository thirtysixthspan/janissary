# Chat about this — conversation entry in the default context menu

**Complexity: 4/10** — small, but it spans client and server with two new RPCs, and its correctness depends on three shallow integration seams: the async menu-contribution pattern inherited from the file navigator's selection action, the xterm selection bridge, and the draft-carrying payload on the conversation `create` path.

Backlog text: *"add a 'chat about this' item to the default menu. This item will open a new converation tab, select the last used ai model, paste in the content to the conversation without launching the query. This feature should be part of the conversations plugin and may require extension of the plugin API to add menu items to the default context menu."*

The goal: an editor buffer, a view tab's text, or a terminal scrollback where text is selected should offer **Chat about this** on right-click. Activating it opens a brand-new conversation tab with a fresh conversation, points it at the last-used AI model, puts the selected text into the conversation's composer without sending it, so the user can add a question around the pasted content (or edit it) before pressing Enter.

## Design decisions established by the feature text, existing behavior, or user answers

**The feature is part of the conversations plugin, and it is the only contributor.** No third-party contribution and no capability added: the default-menu contribution is a declaration field with an activation handler, exactly like `selectionAction` — which carries no capability of its own (`src/plugins/conversations/manifest.ts:13` lists none for it).

**The menu label is `Chat about this`, verbatim as written in the backlog entry.**

**The entry rides the default context menu, which today serves only Copy and Paste** (`web/src/context-menu/DefaultContextMenu.tsx`, protocol in `web/src/context-menu/default-menu-target.ts` and the hook in `web/src/context-menu/useDefaultContextMenu.ts`). The default menu appears wherever a right-click has not been claimed by a surface with its own menu, and only entries that can act are shown — an entry that cannot act is omitted, not greyed out.

**Extending the plugin API is in scope per the feature text, and the contract shape already exists.** `TabPluginSelectionAction` (`src/plugins/api.ts:173`) declares only a label and an action name; the host decides when the entry is offered, and activating it names only what was offered ("the client never names a plugin or an action the application did not just offer it", `product/specs/tab-plugins.md:117`). The default menu has no plugin extension point at all today, so an equivalent declaration field is added rather than a new mechanism invented.

**The contribution resolves asynchronously, exactly like the navigator's selection entry.** The default menu builds synchronously from the DOM, but only the server knows which plugins contribute an entry — so the client asks, and the reply arrives while the menu is open. The full pattern exists: `src/plugins/selection.ts` hosts `runPluginSelectionAction`, the RPC pair `fileNavigatorSelectionAction` / `runFileNavigatorSelectionAction` (`src/protocol/file-navigator.ts:112`–`:116`), and the client hook `web/src/useSelectionAction.ts` with generation-based staleness tracking (`product/plans/complete/prevent-stale-selection-actions.md`). The default menu gets its own pair of protocol methods and its own hook, modeled on those sites; opening the menu never activates a plugin, only the reply being used does.

**The entry appears on terminal selections too.** The app already draws its default menu on terminal right-clicks — per the context-menu spec, a terminal's menu offers Paste but no Copy, because a terminal's selection is xterm state, not DOM selection, which is why `globalThis.getSelection()` finds nothing (`web/src/context-menu/useDefaultContextMenu.ts:6`) and Copy is omitted. Including terminal selections therefore does not mean fighting the browser's own menu: the target resolution also consults the xterm selection of the terminal the right-click landed on. **Copy never gains this case** — the terminal's copy shortcut stays the way to copy from it, and the harness-tab decision in `product/plans/complete/harness-terminal-copy-selection.md` ("An in-app context menu on the terminal — the browser's own menu is what xterm's right-click handler is written to serve") is respected by adding only the chat entry, not a terminal Copy.

**The content is the selection text, and nothing else.** No source annotation, no composed prompt; the default menu already has exactly the selection available.

**The last-used model is an explicitly remembered global pair.** A single global (harness, model) pair, persisted, remembered separately from any one conversation. It is updated when any conversation's model selector changes a conversation's pair (`selectModel`, `src/conversations/manager.ts:108`); sending a query does not update it — the act of choosing is what remembers. The browser's persistence question is settled below in Proposed changes. It governs this feature and also replaces `availableConversationModels()[0]` as the starting pair of every freshly created conversation (`create` at `src/conversations/manager.ts:63`), falling back to the first available pair when the remembered one is no longer catalogued — the same rule an already-saved conversation applies (`product/specs/conversations.md`, "If a saved pair is no longer catalogued, the next query uses the first available pair"). Selection has to wait for the model list to arrive the way every other model-loading surface does; the pair travels in the conversation tab payload's existing `models` list, so a new conversation's pair is chosen among what the payload already carries.

**A new conversation starts every time; the pasted content is a draft, nothing is sent.** The tab opens titled `New conversation`: per `product/specs/conversations.md`, the first *submitted* query supplies the title, so pasting without sending leaves it `New conversation`. The draft lives in the tab payload as an optional field and initializes the composer's React state once, on mount; subsequent payload re-renders (which arrive on every `notify` while a turn streams) do not overwrite it, matching how the composer already holds its own text state. If the tab is closed without sending, the draft is gone — the same fate composer text already meets, and not persisted anywhere.

**The plugin API currently cannot prefill a composer.** The `conversations` `create` topic action (`src/plugins/api.ts:103`) takes only an `id`; a `query` field is added to it, threaded through `ConversationsManager.create` into the opened payload as the draft.

## What already exists (reuse, don't redefine)

| Piece | Where |
|---|---|
| Default-menu target resolution: `DefaultMenuTarget`, `isTextEntryElement`, `resolveDefaultMenuTarget`, `defaultMenuGroups` | `web/src/context-menu/default-menu-target.ts` |
| Default-menu hook and component (claim by `defaultPrevented`, `pending`, `close`) | `web/src/context-menu/useDefaultContextMenu.ts`, `web/src/context-menu/DefaultContextMenu.tsx` |
| Default-menu spec (Copy/Paste semantics, terminal's menu, "entry that cannot act is left out") | `product/specs/context-menu.md` |
| Plugin menu-entry contract precedent: `TabPluginSelectionAction` declares *only* a label and action name | `src/plugins/api.ts:173` |
| The host half of a plugin-contributed menu entry | `src/plugins/selection.ts` (`runPluginSelectionAction`, `invokeSelectionAction`) |
| The RPC pair a browser menu uses to ask and then run a plugin-contributed entry | `src/protocol/file-navigator.ts:112`–`:116` (`fileNavigatorSelectionAction`, `runFileNavigatorSelectionAction`) |
| The client hook that queries, installs the reply with generation tracking, and clears it when the menu closes | `web/src/useSelectionAction.ts` |
| The group-ordering precedent: a contributed entry rendered as its own group above Copy | `product/plans/complete/audio-player-tab-plugin.md` (Navigator menu entry) |
| The stale-entry guard: a monotonically increasing generation, advanced when the menu closes | `product/plans/complete/prevent-stale-selection-actions.md`, done inside `web/src/useSelectionAction.ts` |
| xterm instance, selection API (`hasSelection()` / `getSelection()`), and the element it renders into | `web/src/shared/terminal/useXterm.ts`, consumers such as `web/src/harness/HarnessTab.tsx` |
| Conversation creation that opens its own tab server-side | `src/plugins/conversations/activate.ts:108`–`:116` (`runListIntent`'s `create` → `topicAction` + `openOrFocusTab`) |
| Conversation manager `create`/`selectModel` and the pair rules | `src/conversations/manager.ts:63`, `:108` |
| Atomic persistence under `~/.janissary/conversations/` | `src/conversations/store.ts` (`ConversationStore`, `writeFile` = `atomicWriteFile`) |
| The tab payload that carries model data to the composer | `conversationPayload` in `src/plugins/conversations/activate.ts:26`; shared type in `src/plugins/conversations/shared.ts` |
| Manifest, capabilities, and notification declarations | `src/plugins/conversations/manifest.ts` |

## Proposed changes

**Server: a new protocol mirror of the navigator selection pair.** Two methods added to the protocol unions beside the navigator's pair in `src/protocol/file-navigator.ts`: one carrying the selection text and asking which plugin contributes a default-menu entry, the other carrying the selection text plus the offered action name and running it. Both are answered through a new server module `src/plugins/default-menu.ts`, shaped directly on `src/plugins/selection.ts`: it resolves declarations to find one with a default-menu contribution, refuses anything the declaration did not offer, and invokes the plugin's activation handler with the selection text and the standard `TabPluginServerCapabilities`.

**Server: declaration and activation contract.** `TabPluginDeclaration` (`src/plugins/api.ts:122`) gains a `defaultMenu?: { label: string }` field following the `selectionAction` pattern, and `TabPluginActivation` gains a `defaultMenuAction?(selection: string, capabilities: TabPluginServerCapabilities)` handler required when the field is declared, following the `selectionAction?` signature. No capability is added; a declaration-contribution resolves through the same host module rather than the capability list, as the navigator's selection action already does.

**The conversations plugin's contribution and handler.** `src/plugins/conversations/manifest.ts` gains `defaultMenu: { label: 'Chat about this' }`. The activation's new handler (`src/plugins/conversations/activate.ts`) runs the existing `create` flow with the selection attached: a fresh id, `topicAction` `create` whose payload now includes the draft, then `openOrFocusTab` with a factory that builds the tab payload including `draftQuery`. The result is the same tab the conversation list's create opens, plus the draft.

**Server: the create action carries a draft.** The `conversations` `create` action type (`src/plugins/api.ts:103`) gains `query?: string`, and `ConversationsManager.create` (`src/conversations/manager.ts:63`) accepts it. The draft is not written into the conversation record — the record is not even created on disk until the first query, per the storage section of `product/specs/conversations.md` — it only rides the tab payload: `ConversationTabPayload` (`src/plugins/conversations/shared.ts`) gains an optional `draftQuery` field that the opened list and conversation payloads may carry, and the composer initializes its text once from it. A conversation created via the ordinary `conversations` list flow simply omits the field.

**Server: the remembered global pair.** `ConversationsManager` gains a `lastUsedPair: ConversationModelPair | null`, persisted as a tiny JSON record beside the conversation records under `~/.janissary/conversations/` written with the same `atomicWriteFile` the store already uses (`src/conversations/store.ts:76`). Every successful `selectModel` rewrites it. `create` starts a conversation from the remembered pair when it is still catalogued, else `availableConversationModels()[0]` as today, so a normal `Cmd+N` conversation and a `Chat about this` conversation start identically. The pair reaches the client inside the conversation payload's existing `models` data, so nothing new crosses the wire for the selector itself.

**Client: the default menu gains a contributed group.** The target-resolution and menu-building path extends: `useDefaultContextMenu` asks the new protocol method when a target with selection text resolves, and installs one extra group — shaped directly on `web/src/useSelectionAction.ts`, including its generation counter and clear-on-close so a reply for a closed menu never surfaces and a late reply cannot lag into the next menu. The contributed entry renders as its own group above Copy, per the audio plan's ordering precedent.

**Client: terminal selection bridging.** `web/src/shared/terminal/useXterm.ts` registers its xterm instance against the element it renders into (a WeakMap from container Element to the accessor pair `hasSelection()` / `getSelection()`, or its `Terminal` — one registration per mounted terminal, removed on teardown). The resolver lives in a new pure module `web/src/shared/terminal/terminal-selection.ts`: given a right-click's target Element, it picks the registered container the target falls inside and answers the selection text or empty. `useDefaultContextMenu` asks it when `globalThis.getSelection()` found nothing, so the terminal case is additive: DOM selections resolve as today, xterm ones fill the gap. `Copy` remains DOM-only deliberately.

**Client: the composer initializes from the draft.** `ConversationComposer` (`web/src/plugins/conversations/ConversationComposer.tsx`) accepts the payload's `draftQuery` as the initial value of its existing text state, only on mount — its state already survives re-renders, so streaming updates can clobber nothing.

**The spec.** `product/specs/context-menu.md` gains a contributed-entries paragraph: what the label can be, that the entry is offered only when a selection resolves, its own group above Copy, the generation rule for stale replies, and the terminal paragraph extended to say the menu may gain this one entry from the xterm selection while Copy remains DOM-only. `product/specs/conversations.md` gains the draft behavior (composer initialized, nothing sent, draft lost on tab close without sending) and the remembered-global pair (its update rule and the new-conversation pairing rule).

## Tests

Colocated per existing conventions: server tests as `src/**/*.test.ts` (vitest project `server`), client tests as `web/src/**/*.test.ts(x)` (project `client`).

- `src/plugins/default-menu.test.ts` — mirror of `src/plugins/selection.test.ts`: resolving a declaration with the field returns the label; running the offered action invokes the handler with the selection; running an unoffered action is refused; a handler absent from the activation is refused with shape mirroring what `selection.test.ts` at `:91` already asserts.
- `src/plugins/conversations/activate.test.ts` — extend: the default-menu handler with a selection produces one `create` topicAction whose action includes the selection-as-draft and one `openOrFocusTab` titled `New conversation` (the `:39` test dummy's pattern).
- `src/conversations/manager.test.ts` — extend: `create` seeds from the remembered pair when it is still catalogued and from the first available pair when not; every successful `selectModel` rewrites the global record; the record round-trips a restart through the persistence slice.
- `web/src/context-menu/DefaultContextMenu.test.tsx` — extend the existing right-click driving at `:19`: with a DOM selection, the contributed entry appears once the reply resolves and its activation sends the run RPC with the selection; stale-reply and clear-on-close behavior mirror `web/src/useSelectionAction.test.ts`'s cases; with a properly claimed surface, no entry.
- `web/src/shared/terminal/terminal-selection.test.ts` — right-click inside a registered container holding a selection resolves its text; outside any container or empty selection resolves empty; teardown removes the registration.
- `web/src/plugins/conversations/ConversationComposer.test.tsx` — extend: a payload with `draftQuery` initializes the composer's text without sending; a payload arriving later (a streaming update) leaves typed text untouched.

## Out of scope

- Third-party plugin contributions of the entry (conversations plugin only, one contributor; a tie-breaker name is asked for but the resolution already refuses plural contributions).
- A "chat about this" entry on surfaces with their own menus (file navigator rows, etc.).

## Open questions

None — all product decisions are settled above: by the feature text (`Chat about this`, paste-only, conversations plugin), the existing specs (default-menu rules, conversation naming), or the user's answers (terminal selections included, explicitly remembered global pair, selection text only). Deliberate cuts already recorded:
- If the tab is closed without sending, the draft is lost (composer text's existing fate); ceiling: persisting drafts comes only if the workflow shows users routinely composing without sending.
- `Copy` is never offered from a terminal selection.
- Sending a query does not update the remembered pair; a selector change does.
- A brand-new conversation from the list also starts on the remembered pair, identical to `Chat about this`.

## Verification

```
$janissary/scripts/run.mjs check-diff
```

Manual check: select text in an editor tab, right-click, and choose **Chat about this**; a new conversation tab opens titled `New conversation`, its composer holds the selected text unsent, and the model selector shows the global pair from the last conversation where it was changed (press Enter twice: the query asks as an ordinary query). Select text in a harness tab's terminal and repeat — the same entry appears and the same behavior follows, and the tab keeps its title. Right-click again with nothing selected — no Chat entry, no menu for that case anywhere lacking a selection. Change a conversation's model selector, then open a fresh conversation from the list — it starts on the pair just chosen; then quit and relaunch the app and select text again — the same pair is still remembered.
