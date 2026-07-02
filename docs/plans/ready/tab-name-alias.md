# Tab name alias

**Complexity: 4/10** — display path already exists (`Tab.title`), but the feature spans a new command, a new RPC, persistence round-trip, and an inline-edit state machine in the tab strip (focus/commit/cancel/double-commit guard) across server and web.

## Goal

Give any tab a **display alias** without changing its internal `label`. The label stays the unique key used everywhere — `msg`/`broadcast` routing, agent-state persistence filenames, monitor targets, shell/ACP/browser session keys. Only the tab strip shows the alias.

Two ways to set it:

1. **`rename <newname>`** typed into a tab sets that tab's alias. `rename` with no argument clears the alias, reverting the strip to the label.
2. **Inline edit in the strip**: clicking the label of the already-active tab transforms it into a text input pre-filled with the current display name, focused. Enter or blur commits; Escape cancels.

`Tab.title` already exists for exactly this ("display name shown in the tab strip when it differs from the label", `src/types.ts:106-108`) and is used by view tabs (image/page/markdown/harness). This feature is: extend the same field to agent tabs, make it settable, and persist it.

## Design decisions

**Reuse `Tab.title` — the display path already works.** `TabManager.view()` projects `title` into `TabView` (`src/tab-manager.ts:265`), `protocol.ts:46-47` carries it, and the web strip already renders `{tab.title ?? tab.label}` (`web/src/TabStrip.tsx:22`). No new display field, no new rendering logic; the whole feature is about *setting* and *persisting* the field.

**One `TabManager.renameTab(index, title)` method; both entry points funnel through it.** It trims the value, sets `tab.title` (or deletes it when empty — empty string must not stick around and render a blank tab), persists via `buildAgentState`, and emits `state: dirty` so both the strip and any open windows refresh. The `rename` command calls it with the tab's own index; the inline edit calls it via a new RPC.

**A dedicated `renameTab` RPC, not a synthesized `rename …` command string.** The inline edit targets a specific tab by index. Routing it through the `command` RPC would only reach the active tab and would break on aliases containing text that parses oddly. `{ method: 'renameTab'; params: { index: number; title: string } }` follows the existing `closeTab`/`setActiveTab` shape (`protocol.ts:76-77`, dispatched in `src/index.ts:135-137`, thin passthrough in `controller.ts`).

**Persist on `AgentState`, restore in `rehydrate`.** Add `title?: string` to `AgentState` (`src/types.ts:141`), include it in `buildAgentState` (`src/tab-manager.ts:83`), and set `tab.title = s.title` in `rehydrate` (`src/tab-manager.ts:302`) after `makeTab`. View tabs are live/in-memory and never persisted, so this only ever round-trips agent tabs — no conflict with the derived titles view tabs compute at creation.

**Aliases are display-only and need not be unique.** No validation beyond trimming: the alias never becomes a filename (that's `VALID_NAME` on the label in `agent-state.ts:15`), never routes a message, and React renders it as text (no injection surface). Two tabs may share an alias; the label remains the disambiguator everywhere that matters. `rename` output should remind the user of this: e.g. `Tab "claude" now displays as "reviewer" (msg/routing still use "claude").`

**Renaming a view tab is allowed and just overrides its derived title.** Simpler than special-casing, and harmless: view tabs aren't persisted, so the override lives only for the session. (Page tabs set their title once at creation, so nothing recomputes over the alias.)

**Edit affordance only on the active tab.** First click on an inactive tab selects it (existing behavior, must not change); clicking the label when the tab is already active enters edit mode. This avoids ambiguity between "select" and "edit" without resorting to double-click, which is awkward alongside the existing single-click select.

## What already exists (reuse, don't rebuild)

| Piece | Where |
| --- | --- |
| `Tab.title` field + doc comment | `src/types.ts:106-108` |
| `TabView.title` on the wire | `src/protocol.ts:46-47`, projected at `src/tab-manager.ts:265` |
| Strip renders `title ?? label` | `web/src/TabStrip.tsx:22` |
| Command shape to copy | `src/commands/clear.ts` (name/match/run), registered in `src/commands/index.ts` |
| Persist/restore pattern | `TabManager.buildAgentState` (`src/tab-manager.ts:83`), `rehydrate` (`:296`) |
| Index-targeted RPC pattern | `closeTab`: `protocol.ts:77` → `src/index.ts:137` → `controller.ts:130` → `tab-manager.ts` |
| Client RPC sender | `JanusClient.send` in `web/src/ws.ts` |

Nothing else consumes `title`: routing (`agent-communication-manager`), monitor targets, completion, and state files all key on `label` — **no changes needed there**, which is the point of the feature.

## Implementation steps

### 1. Server: `TabManager.renameTab`

`src/tab-manager.ts` — new method:

```ts
renameTab(index: number, title: string): void {
  const tab = this.tabs[index];
  if (!tab) return;
  const trimmed = title.trim();
  if (trimmed && trimmed !== tab.label) tab.title = trimmed;
  else delete tab.title;   // empty or same-as-label ⇒ no alias
  this.persist(this.buildAgentState(tab));
  messageBus.emit('state', { type: 'dirty' });
}
```

(Setting the alias equal to the label is treated as clearing it — keeps state files clean.)

### 2. Server: persistence round-trip

- `src/types.ts`: add `title?: string` to `AgentState`.
- `buildAgentState`: add `title: tab.title,`.
- `rehydrate`: after `makeTab(...)`, `if (s.title) tab.title = s.title;`.

### 3. Server: `rename` command

New `src/commands/rename.ts` modeled on `clear.ts`:

- `match`: `/^rename\b/i`
- `run`: extract the remainder after `rename`, find the tab's index (`managers.tab.findIndex(tab.label)` — the `run` signature already provides `tab.index`, prefer that), call `managers.tab.renameTab(index, rest)`, and `append` a confirmation line (or "alias cleared" when empty).

Register in `src/commands/index.ts`. Check `src/commands.ts` `getOutput` help text — if there's a command list shown by `help`, add `rename` there.

### 4. Protocol + dispatch

- `src/protocol.ts`: add `| { method: 'renameTab'; params: { index: number; title: string } }` to `RpcCall`.
- `src/index.ts` (RPC switch, near `closeTab` at line 137): `case 'renameTab': { controller.renameTab(message.params.index, message.params.title); break; }`
- `src/controller.ts`: passthrough `renameTab(index, title)` → `this.managers.tab.renameTab(index, title)` (mirror `closeTab` at `:130`).

### 5. Web: inline edit in the strip

- `web/src/ws.ts`: add `renameTab(index: number, title: string)` sender (one-liner like the other RPC wrappers).
- `web/src/TabStrip.tsx`: extract the per-tab element into a `TabLabel` (or `TabItem`) component — TabStrip is small now, but the edit state machine will push it toward the 200-line `max-lines` limit and the extraction keeps each piece testable.
  - Local state: `editing: boolean`, `draft: string`.
  - Click on the label `<span>` when `index === activeTab` → `setEditing(true)`, `draft = title ?? label`. (Click anywhere else on an active tab does nothing, as today; click on inactive tab still calls `onSelect`.)
  - When editing, render `<input value={draft} …>` with `autoFocus` and select-all on focus; `onClick` stops propagation so typing/clicking in the field doesn't re-fire tab selection.
  - Commit on Enter and on blur → `onRename(index, draft)` then `setEditing(false)`. Escape → cancel without committing. Enter followed by blur must not double-commit — commit once, guard with the `editing` flag (set it false before calling `onRename`).
  - `App.tsx`: pass `onRename={(i, t) => client.renameTab(i, t)}` through to `TabStrip`.
- The server echoes the change back via the normal state broadcast, so the strip updates without optimistic local state.

Sizing note: the input should be styled (in `theme.css`) to match the tab's text — same font/size, transparent-ish background — so the transform feels in-place rather than like a popup.

### 6. Tests

- `src/commands/rename.test.ts` — mirrors `clear.test.ts`: sets alias, clears alias on bare `rename`, confirmation text appended.
- `src/tab-manager` tests (extend `tab.test.ts` or wherever `buildAgentState`/`rehydrate` are covered): `renameTab` sets/clears `title` + persists; `rehydrate` restores `title` from state.
- `web/src/TabStrip.test.tsx` — extend: click active tab's label shows input pre-filled with current display name; Enter commits (`onRename` called once with trimmed value); Escape cancels; blur commits; click on inactive tab still selects (no edit).

## Out of scope / explicitly unchanged

- `msg`, `broadcast`, `send`, monitor targets, completion, connection panel, state filenames — all continue to use `label`. The alias is invisible to them by design.
- No alias support in the `agent` creation command (create first, rename after).
- Per the tab-label convention already in project memory: the strip shows the name only — no markers or status suffixes get appended to the alias.

## Verification

`./scripts/run.mjs check-diff` after each step. End-to-end: start the app, `rename reviewer` in a tab → strip shows `reviewer`; `msg <original-label> hi` from another tab still routes; restart the server → alias survives rehydrate; click active tab label → edit in place, Enter commits, Escape cancels.
