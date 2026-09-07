# Per-tab command bar drafts

**Complexity: 3/10** — one new hook module in the agent-tab feature, one prop pair threaded from the app shell down to the command bar, and the tests that pin the behavior. No wire-protocol change, no new architecture, and no server involvement.

## Problem

Text typed into an agent tab's command bar but not yet executed lives in one `useState('')` inside `web/src/agent-tabs/command-input/CommandInput.tsx`. Exactly one command bar is mounted at a time — `AppMain` builds `focusedAgentBody` and `AppCenterActionArea.renderBody` renders it only for the focused agent tab — so that single piece of state is wrong in both directions:

- **Switching to a view tab loses the draft.** An editor, harness, plugin, or file-navigator tab makes `renderBody` return `null`, so `AgentTabBody` unmounts and takes the typed text with it. Coming back gives an empty bar.
- **Switching to another agent tab carries the draft along.** Two agent tabs render the same element at the same position in the tree, so React keeps the component mounted and the text typed into tab A appears in tab B's bar — where submitting it would run it against the wrong agent.

The split center area has a second command bar with the same problem: `InactiveAgentTabBody` renders its own `CommandInput` for the agent tab visible in the pane without keyboard focus (`tabs.md` § Split tab strips — "Each visible agent tab keeps its command line"). It unmounts as soon as that pane selects another tab, or as soon as the pane gains focus and the tab becomes the focused body instead — so a draft typed there is lost the same way, and a draft typed in the focused pane does not follow its tab into the other pane.

`product/specs/tabs.md` § Per-tab state isolation already promises "Each tab carries its own transcript log, command history (including navigation index), and scroll offset. Switching tabs preserves each tab's state." The unexecuted command line is the one piece of per-tab state that does not hold.

## Goal

An unexecuted command typed into a tab's command bar belongs to that tab. Focusing another tab and returning restores it, ready to edit or execute; the other tab meanwhile shows its own draft, or an empty bar when it has none. One store serves both bars, so a draft also survives a tab moving between the two panes of a split.

## Design decisions

**The store lives in the app shell, not in the bar.** The bar unmounts on a view-tab switch and is reused across agent tabs, so it can hold neither the drafts of tabs it is not currently showing nor its own across an unmount. `App.tsx` already owns every piece of state with that lifetime (`inputReference`, `recallReference`, `dropReference`), and it is the layer §7 of `react-code-organization.md` names for state two subtrees must agree on.

**A ref-held `Map`, not React state.** The drafts are read at mount and on a tab change and written on every keystroke. Holding them in `useState` would re-render `App` — and with it the transcript — on every character typed, for a value no other component renders. A `Map` in a ref is the same pattern `tabHandles` and `harnessHandles` already use for per-tab client state.

**Client-only, not persisted.** An unexecuted draft is view-local ephemeral state, the category `architecture-principles.md` §1 explicitly leaves to the client, alongside scroll position and cursor. It is not sent to the server, not written to agent state, and not restored on `--relaunch` — the same policy `hasUnread` and `scrollOffset` follow.

**Write-through on every edit, keyed by tab label.** Every value change writes to the store immediately, so nothing has to be saved on the way out — an unmount, a close, or a crash cannot lose what was already written. The label is the identity every other per-tab client map in the app is keyed by (`tabHandles`, `harnessHandles`, `shellHandles`).

**The empty string is stored as absence.** Submitting clears the bar; deleting the key rather than storing `''` keeps the store to tabs that actually hold a draft and makes "no draft" and "empty draft" the same state, which is what the user sees.

**Drafts of closed tabs are pruned.** Agent names come from a fixed 52-name pool of *unused* names (`tabs.md` § Agent tab creation), so a closed tab's name can be handed to a new agent later. Without pruning, that new tab would open with a dead tab's text in its bar. An effect on the tab list drops every draft whose label is no longer open.

**The bar detects the tab change itself rather than being remounted with a `key`.** Adjusting the state during render (React's documented "adjusting state when a prop changes" pattern) keeps the same textarea DOM node across an agent-to-agent switch, so focus, the autofocus effect, and the element `inputReference` points at are all undisturbed. A `key` would rebuild the node and make correctness depend on a caller remembering to pass one.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The single command-bar value state being replaced | `web/src/agent-tabs/command-input/CommandInput.tsx:38` |
| The focused agent body, rendered per focused tab | `web/src/AppCenterActionArea.tsx:40`–`:42` |
| The split pane's second command bar | `web/src/agent-tabs/InactiveAgentTabBody.tsx:55` |
| Per-tab client-state maps held in an `App` ref | `web/src/App.tsx` (`tabHandles`), `web/src/useTabHandles.ts` |
| Props threaded app shell → body → bar | `AppMain` → `AgentTabBody` → `CommandArea` → `CommandInput` |
| `AppMain`'s props derived from `AgentTabBody`'s | `web/src/AppMain.tsx:22`–`:25` |
| The state-emitting app test harness | `web/src/App.test.tsx:26`–`:63` |

## Implementation steps

1. **New module `web/src/agent-tabs/command-input/useCommandDrafts.ts`.** Export the `CommandDrafts` type (`Map<string, string>`) and two hooks:
   - `useCommandDrafts(tabs: TabView[]): CommandDrafts` — holds the map in a ref and returns it, with an effect that deletes every entry whose label is not among the open tabs.
   - `useCommandDraft(key: string, drafts: CommandDrafts)` — returns `{ value, setValue }`. `value` initializes from `drafts.get(key)`; `setValue` writes through (deleting on empty) before setting state; a `key` different from the one last rendered swaps in that key's draft during render.

2. **`web/src/agent-tabs/command-input/CommandInput.tsx`.** Add required `draftKey: string` and `drafts: CommandDrafts` props and replace `useState('')` with `useCommandDraft(draftKey, drafts)`. Nothing else in the component changes — `bar.recall`, tab completion, the drop handle, and `submit` all already go through `setValue`.

3. **`web/src/agent-tabs/command-input/CommandArea.tsx`.** Accept the two new props through its `CommandInputProperties` spread and forward them to `CommandInput`.

4. **`web/src/agent-tabs/AgentTabBody.tsx`.** Take `commandDrafts: CommandDrafts`, and pass `draftKey={current.label}` and `drafts={commandDrafts}` to `CommandArea` — the body already holds the tab whose bar it is rendering, so the key is derived here rather than threaded.

5. **`web/src/agent-tabs/InactiveAgentTabBody.tsx`.** Take `commandDrafts` alongside its `tab`, and pass `draftKey={tab.label}` and `drafts={commandDrafts}` to its own `CommandInput`, so the split pane's second bar reads and writes the same store.

6. **`web/src/AppCenterActionArea.tsx`.** Take `commandDrafts` and hand it to `InactiveAgentTabBody` in `renderBody`.

7. **`web/src/AppMain.tsx`.** Destructure `commandDrafts` and forward it to both `AgentTabBody` and `AppCenterActionArea`; its props type already picks the new field up from `AgentTabBody`.

8. **`web/src/App.tsx`.** Call `useCommandDrafts(tabs)` and pass the result to `AppMain`.

## Tests

- `web/src/agent-tabs/command-input/useCommandDrafts.test.tsx` (new) — render the hooks in a test component:
  - a draft written under one key is returned when that key is rendered again after an unmount;
  - changing the key swaps the value to the other key's draft, and back;
  - an unknown key starts empty;
  - setting the value to `''` removes the entry rather than storing it;
  - `useCommandDrafts` drops the draft of a tab that is no longer in the tab list, and keeps the drafts of tabs that remain.
- `web/src/agent-tabs/command-input/CommandInput.test.tsx` — extend the existing render helpers with a shared `drafts` map and `draftKey`, and add a "per-tab drafts" block: typing stores the text under the rendered key; re-rendering under another key shows that key's draft (empty when it has none); re-rendering under the original key restores the text; unmounting and remounting under the same key restores it; submitting on Enter clears the stored draft so the tab reopens empty.
- `web/src/agent-tabs/InactiveAgentTabBody.test.tsx` — the split pane's bar reads its own tab's draft from the store and writes typing back to it, keyed by that tab's label rather than the focused tab's.
- `web/src/App.test.tsx` — the end-to-end case from the issue: emit two agent tabs with `activeTab` 0, type an unexecuted command, emit the same tabs with `activeTab` 1 and assert the bar is empty, then emit `activeTab` 0 again and assert the typed text is back and can be submitted to the server.

## Spec

`product/specs/tabs.md` § Per-tab state isolation — name the unexecuted command bar text among the per-tab state a tab switch preserves, and say it is client-only (not restored on `--relaunch`) and cleared when the command is executed.

## Out of scope

- **Persisting drafts to agent state or across a page reload.** The draft is view-local ephemeral state; making it survive a reload is a server-side change to the tab record and a separate item.
- **Drafts for the search bar, the harness launch dialog, or any other input.** Only the agent tab's command bar is at issue.
- **Carrying a draft through a `rename`.** The alias changes what the strip displays, not the label the store is keyed by, so a renamed tab keeps its draft; nothing about aliases needs to change.
- **Restoring caret position or selection within a restored draft.** The text comes back; the caret lands where a value change normally leaves it.
- **The queue popup's edit path.** `onEditQueued` continues to fire on change exactly as it does now.
