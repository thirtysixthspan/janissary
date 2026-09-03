# Give a conversation tab the agent tab's command bar

**Complexity: 6/10** — no new architecture, but the reuse crosses the client plugin boundary, so it is a promotion of four existing modules into the shared layer, two new shared modules extracted from code that already exists, one added export on the plugin client API, and a rewrite of the conversation composer against them. Every layer it touches already has the seam it needs; nothing new is invented.

A conversation tab's message input is sixteen inlined lines in `ConversationTab.tsx`: a plain controlled `<textarea>`, a `Send` button, Enter to submit, Shift+Enter for a newline. The agent tab's command bar is a developed input — a status dot and prompt glyph, a textarea that grows with its content up to nine lines, ArrowUp/ArrowDown recall through the tab's own history, inline ghost text completing from history, Ctrl+Enter as a second submit — and none of it reaches the conversation. The two share not one line of code today, only the CSS custom properties.

They cannot share code by ordinary means. Conversations is a client tab plugin, and `eslint.plugin-boundaries.mjs` restricts `web/src/plugins/*/**` to `../api`, `../shared.css`, and its own `@shared/plugins/<id>/shared` contract. `web/src/agent-tabs/command-input/**` is unreachable from it, and so is `web/src/shared/**`. That restriction is the plugin architecture working as designed, not an obstacle to route around: the sanctioned way for a plugin to reach a host module is for the host to publish it on the plugin client API, which `web/src/plugins/api.ts` already does for `renderMarkdown`. This follows that precedent exactly.

## Approach

**Split the command bar into a shell and a keymap.** The agent's `CommandInput` is one component holding chrome, baseline key behavior, and agent-tab modality together. Only the first two are shareable — `pickerOpen`, `queueOpen`, Tab completion, and the drop handle are agent-tab facts and stay put. So two new modules in `web/src/shared/command-bar/`:

- `CommandBarShell.tsx` — presentational only. Renders the `.command-area` chrome the agent bar renders today (an `above` slot for the completion strip, the status dot, an optional `label` before the prompt glyph, the ghost overlay, the textarea) and owns the autosize effect, which is inlined in `CommandInput.tsx` today and is the one piece of behavior inseparable from the markup. Props are data and slots, never feature flags.
- `useCommandBarKeys.ts` — the baseline keymap and the state transitions under it: Enter submits, Shift+Enter inserts a newline, Ctrl+Enter submits, ArrowUp/ArrowDown walk history from the first/last caret line, ArrowRight/End accept the ghost. Returns `{ ghost, onKeyDown, submit, insertNewline, recall, resetHistoryWalk }`.

**Composition, not an escape hatch.** The obvious way to let the agent keep its extra keys is a `onKeyDownBefore` prop on the shared hook. That is a feature-shaped hole in a shared module, and it also cannot express the agent's real ordering, which interleaves its own checks around the baseline ones. Instead the agent keeps its own `onKeyDown` and *calls* `bar.onKeyDown` at the two points where baseline handling should take over — once for the Enter chords it does not intercept, once as the fallthrough. Nothing about the agent tab reaches the shared modules, and no baseline key behavior is written twice.

**Promote the four pure modules.** `command-caret-lines.ts`, `ghost-suggestion.ts`, `textarea-splice.ts`, and `useCommandHistoryRecall.ts` are already free of agent knowledge and are exactly what the new hook is built from. They move to `web/src/shared/command-bar/` with their tests, per the guideline's "move the file — don't leave a copy behind". `command-completion.ts`, `search-intercept.ts`, `command-interceptions.ts`, and `useCommandBarSubmit.ts` stay in `agent-tabs/`: each knows something about the agent tab or the app shell.

**Publish through `web/src/plugins/api.ts`.** Both new modules are re-exported there, the route `renderMarkdown` already takes. This does **not** move `TAB_PLUGIN_API_VERSION`: that constant versions the server-side declaration contract a manifest is checked against by exact equality, and a client-side additive export does not change what a manifest must declare — the same reasoning under which `renderMarkdown` was published without moving it. `plugins.md` §4 classifies an added export as additive in any case.

**The conversation composer becomes a component of its own.** `ConversationComposer.tsx`, beside `ConversationTab.tsx`, owning the query state, the history it recalls from (this conversation's own past queries, oldest first, which is the same shape the agent bar's per-tab history has), and the one guard the conversation needs that the agent does not: a submit while a reply is streaming is refused, and refusing it must not clear what the user typed. That guard lives in the composer's own `onKeyDown` wrapper rather than as a flag on the shared hook.

**The `Send` button goes.** The issue asks for the same input, and the agent bar has no send button — it submits on Enter, which the conversation already did too. The button's disabled state was the only place the streaming refusal was visible; the composer's guard replaces it, and the blinking dot the shell already renders for `busy` shows the same "a reply is in flight" state the button's disabled look did.

**No new CSS.** `.command-area` and its children are styled in `web/src/theme.css`, which is global, and `shared.css`'s own comment says anything a host component also renders stays there. The plugin renders the host's shell component, so it inherits those rules without naming a class itself. What does change is the conversation tab's frame: the padded `.plugin-tab` box would inset the command bar and break its full-width top rule, so `.conversation-tab` drops the frame's padding and hands it to the header and the turn list instead — the same move `.conversation-list` already makes, for the same reason.

## Implementation steps

1. `git mv` the four pure modules and their tests from `web/src/agent-tabs/command-input/` to `web/src/shared/command-bar/`: `command-caret-lines`, `ghost-suggestion`, `textarea-splice`, `useCommandHistoryRecall`. Fix the import paths in their tests and in `CommandInput.tsx`. Update the stale path in `web/src/editor/suggest-request.ts`'s comment, which names `../ghost-suggestion.ts`.
2. `web/src/shared/command-bar/CommandBarShell.tsx` — new presentational component with the autosize effect, rendering the markup `CommandInput` renders today.
3. `web/src/shared/command-bar/useCommandBarKeys.ts` — new hook holding the baseline keymap, ghost lookup, submit, newline insert, and history walk.
4. `web/src/agent-tabs/command-input/CommandInput.tsx` — rewrite as a composition of the two, keeping `pickerOpen`, `queueOpen`, Tab completion, `recallRef`, and `dropRef` exactly as they behave now. Its props type is unchanged, so `CommandArea`, `AgentTabBody`, and `InactiveAgentTabBody` need no edit.
5. `web/src/plugins/api.ts` — re-export `CommandBarShell` and `useCommandBarKeys`, with a comment saying why they are published.
6. `web/src/plugins/conversations/ConversationComposer.tsx` — new component: query state, the conversation's own query history, the streaming guard, and the two shared modules.
7. `web/src/plugins/conversations/ConversationTab.tsx` — render `ConversationComposer`, dropping the inlined textarea, the `Send` button, the `query` state, and `send`.
8. `web/src/plugins/conversations/conversations.css` — drop the `.conversation-composer` rules; move the frame's padding off `.conversation-tab` and onto the header, the turn list, and the deleted notice.
9. `product/specs/conversations.md` — describe the input a conversation tab now has.
10. `product/specs/tab-plugins.md` — record the two additions to the client API surface.

## Tests

- `web/src/shared/command-bar/CommandBarShell.test.tsx` (new): grows the textarea to fit multi-line content and shrinks it back; renders the ghost overlay with the typed prefix hidden; renders the `above` slot and the `label` before the prompt glyph; blinks the dot when busy; disables the textarea when told to; carries the accessible name it is given.
- `web/src/shared/command-bar/useCommandBarKeys.test.tsx` (new): Enter submits the trimmed value and clears; Enter with only whitespace clears without submitting; Shift+Enter inserts a newline and does not submit; Ctrl+Enter submits; ArrowUp/ArrowDown walk history from the first/last caret line and are ignored mid-value; ArrowRight and End accept the ghost only with the caret at the end; the ghost is the newest history entry that extends the typed text.
- `web/src/agent-tabs/command-input/CommandInput.test.tsx` (existing, 364 lines): must pass unchanged except for import paths. It already covers recall, ghost text, busy, `queueOpen`, multi-line autosize, and the drop handle — it is the regression net for step 4 and should not be rewritten to suit the refactor.
- `web/src/plugins/conversations/ConversationComposer.test.tsx` (new): Enter sends the trimmed query and clears the input; Shift+Enter inserts a newline and sends nothing; Enter while a reply is streaming sends nothing **and keeps the typed text**; ArrowUp recalls the previous query in the conversation; the textarea is disabled once the conversation is deleted; the dot blinks while streaming.
- `web/src/plugins/conversations/ConversationTab.test.tsx` (existing): `sends the composer text` is rewritten to submit with Enter rather than clicking `Send`, which no longer exists.
- `web/src/plugins/conversations/conversations-style.test.ts` (existing): extended to pin that the tab frame gives up its padding, since that is what keeps the command bar full-width.

## Out of scope

- **The other three consumers of the `.command` chrome** — `SearchBar.tsx`, the quick-open popup, the editor find bar. Each renders the classes directly and works; converting them to the shell is a separate cleanup with its own regression surface.
- **Tab completion in a conversation.** The agent's completion RPC completes commands and paths against the project; a conversation's input is prose to a model, and there is nothing to complete against.
- **The drop handle.** Dragging a file from the navigator into a conversation would need the navigator to know about plugin tabs, which is a feature reaching into another feature — the thing the boundary exists to prevent.
- **`.command-area.drop-target`, which has no CSS rule anywhere.** A real latent bug in the agent bar's drop highlight, unrelated to this change and not to be fixed under cover of it.
- **`TAB_PLUGIN_API_VERSION`** — see the Approach note.
- **Sharing the conversation's Escape-to-cancel listener.** It is a window-level listener the tab owns, not part of the input.
- **User documentation.** No page in `documentation/user-documentation/` describes the conversation composer's keys, and this task does not add documentation for previously undocumented behavior.

## Verification

Automated: `./scripts/run.mjs check-diff` after each step.

Manual: open a conversation tab, confirm the input renders the dot and prompt glyph, grows as it fills, recalls a previous query with ArrowUp, shows ghost text completing an earlier query, sends on Enter, and refuses to send — without losing the typed text — while a reply is still streaming.
