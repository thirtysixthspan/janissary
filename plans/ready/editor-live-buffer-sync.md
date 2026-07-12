# Sync the editor buffer to the server as live, unsaved draft state

**Complexity: 4/10** — spans server and web with one new RPC on the existing shared wire contract, one new transient (in-memory, non-broadcast) field on `Tab`, a tiny server handler, and one new client debounce hook; every piece mirrors an already-working pattern named in this plan (`saveFile` dispatch, `renameTab` client method, `useSyntaxHighlight` hook shape). What earns the 4 over a 3 is the number of coordinated touch points (~9 files across both sides) and the care needed to keep the draft out of both `TabView` and `AgentState`. No persistence, no new file-serving surface, no concurrency reasoning beyond one debounce timer.

**Run this before [[monitor-editor-tab-change-feed]].** That plan's Decision 6 accepts "unsaved keystrokes are invisible to monitors until save" as a limitation because, at the time it was written, the server had no access to the live buffer at all. This plan removes that constraint by giving the server a transient copy of the buffer as the user types; the monitor-feed plan can then be revisited to prefer this draft over the last saved-to-disk content when one exists and is newer.

## Summary

Today the editor buffer is purely client-side state (`web/src/editor/useEditor.ts` — plain React state/refs, no networked debounce) and the server learns about its content exactly once per action: on `saveFile` (Ctrl+S), which writes straight to disk and discards the payload (`src/editor-save.ts:10-23`, `writeFileSync(filePath, content, 'utf8')`). There is no per-keystroke round trip today.

This plan adds a **debounced, fire-and-forget sync**: shortly after the user stops typing, the client sends the current buffer over a new RPC, and the server caches it as a transient "draft" on the tab — separate from the `EditorView` object that already gets fully re-broadcast to every client on each tab-state push. Keeping it separate is the crux of the design: `buildTabView` already sends the *whole* `tab.editor` object on every broadcast (`src/tab-view.ts:40`, `editor: tab.editor`), so if the draft lived inside `EditorView` it would echo straight back to the client that just sent it — the classic self-notification problem, and one this plan avoids structurally rather than by adding sequence numbers or an "ignore my own update" check.

## Design decisions

1. **The draft lives in a new sibling field on `Tab`, not inside `EditorView`.** Add `Tab.editorDraft?: { content: string; updatedAt: number }` next to the existing `editor?: EditorView` field (`src/types.ts:161-162`), and — critically — `buildTabView` (`src/tab-view.ts`) must **not** include it in the `TabView` it sends to clients. The client already owns and renders its own buffer; it never needs the server's copy pushed back. This sidesteps the echo/self-overwrite problem entirely instead of solving it with dedup logic, and keeps `EditorView`'s existing full-object-every-broadcast behavior (see the `EditorView` re-broadcast fact below) exactly as it is today — nothing about the client-visible wire shape changes.
2. **One new RPC, shaped like `saveFile` but not written to disk.** `{ method: 'editorSync'; params: { url: string; content: string } }`, added to the `RpcCall` union in `src/protocol.ts` next to `saveFile` (`protocol.ts:125`). The handler identifies *which* tab the draft belongs to the same way `saveFile`'s handler already does: `managers.tab.tabs.find((t) => t.editor?.url === url)` (`editor-save.ts:17`). That is the *only* lookup it needs — `saveFile`'s other resolution step, `managers.tab.openFilePath` (`tab-manager.ts:323`, `openFilePath(id)`), produces the on-disk path, which `editorSync` never touches, so it is not called at all. Dispatch mirrors `saveFile`'s path (`message-handler.ts` → a new `controller.syncEditorBuffer()` → a new `src/editor-sync.ts`, in the style of `editor-save.ts`) but the handler only ever writes `tab.editorDraft`, never `fs.writeFileSync`.
3. **Client-side debounce is its own timer, not reused from syntax highlighting.** `useSyntaxHighlight.ts` already debounces 100ms after each edit (`web/src/editor/useSyntaxHighlight.ts:11`, `DEBOUNCE_MS = 100`), but that's a *local* recompute with no cost beyond CPU. Piggybacking the network call on the same 100ms timer would fire an RPC on every brief typing pause during fast, continuous typing — needless chatter for a fairly expensive (relative to a local recompute) round trip. This plan uses its own debounce of **500ms** (a fixed module-top constant in the new hook, named in the style of `DEBOUNCE_MS`), on the theory that a monitor reacting to a draft doesn't need sub-second freshness the way live syntax highlighting does. The trigger is any change to the editor's `state` object — typing, paste, undo/redo, kill/yank, and the external-change reload — not literally "keystrokes"; the full trigger/skip contract is specified in Proposed change 7 (`useEditorSync.ts`). Keeping the two timers independent also avoids coupling two unrelated concerns (rendering vs. sync) on one clock.
4. **The draft is cleared on save, not merged with it.** When `saveFile` succeeds, the content is now canonical on disk and (per the other plan) observable there; `editor-save.ts`'s handler clears `tab.editorDraft` so a stale draft never lingers and outlives its purpose once a real save has superseded it. If the user keeps typing after saving, a fresh draft accumulates normally from the new debounce cycle.
5. **No persistence, ever.** `editorDraft` is exactly as ephemeral as the rest of an editor tab's state (`specs/editor-tab.md`: "no persisted agent state"). `buildAgentStateFromTab` (`src/tab-agent-state.ts:5-28`) already doesn't read `tab.editor` at all, and this plan adds `editorDraft` as a distinct field it likewise must never read — called out explicitly here since "just don't add it" is the entire safeguard; there's no type-level enforcement of this in the current `AgentState` builder.
6. **No new ingress, no new allow-list.** `editorSync` is a new *method* on the already-gated WS RPC channel (token + Origin/Host guard, per architecture principle 9) — not a new HTTP route or served path. Its only validation is that `url` matches a currently-open editor tab (the `editor?.url` find in Decision 2); it performs no path resolution and never touches the filesystem, so it cannot widen file access.
7. **Fire-and-forget; no meaningful response payload.** Unlike `saveFile` (which reports a write error the UI must surface, e.g. permission denied), `editorSync` has nothing failure-prone to report — it's an in-memory map write. The existing dispatch pattern already supports this with zero new machinery, verified on both sides: every void case in `handle()` falls through to the generic `reply({ t: 'rpc-reply', id: message.id, result: 'ok' })` at `message-handler.ts:60`, and the client sends via `JanusClient.send()` (`ws.ts:61-63`), which registers no `pending` callback — so the `'ok'` reply is silently dropped by the `pending.get(event.id)` miss at `ws.ts:52-53`. Accepted trade-off: `send()` also silently no-ops when the socket isn't open (`ws.ts:62`, `readyState === WebSocket.OPEN` guard), so a sync lost to a dropped connection leaves the draft stale until the next buffer change — fine for a best-effort transient draft whose consumers already prefer newer sources.

## Verified codebase facts that shape the design

- **The wire contract is already unified.** No separate `web/src/protocol.ts` exists; `web/src/` imports `src/protocol.ts` via the `@shared` alias (`web/tsconfig.json:13`, `"@shared/*": ["../src/*"]`; same alias in `web/vite.config.ts:13`) — e.g. `import type { ... RpcCall ... } from '@shared/protocol'` at `ws.ts:1`. Adding `editorSync` to the one `RpcCall` union is automatically visible to both sides — no manual mirroring risk (principle 7).
- **No per-keystroke round trip exists today.** `web/src/EditorTab.tsx`'s `onKeyDown` (line 134) makes no client/RPC call; the only `client.saveFile(...)` call is inside the explicit Ctrl+S handler (line 37). `web/src/editor/useEditor.ts` has zero `rpc`/`client.`/`debounce` references — buffer, cursor, and dirty state are fully local.
- **`saveFile` is the save precedent to mirror the shape of, not the effect of.** `src/protocol.ts:125`; server dispatch `message-handler.ts:49` → `controller.saveFile()` (`controller.ts:115-116`) → `saveFile()` in `editor-save.ts:10`, which resolves the path via `managers.tab.openFilePath` (`tab-manager.ts:323`) and calls `writeFileSync`.
- **`EditorView` already re-broadcasts in full on every tab-state push, with no dirty/diff check.** `src/tab-view.ts:40`: `editor: tab.editor`. This is exactly why the draft must live outside `EditorView`/outside whatever `buildTabView` sends — putting it inside would echo every synced keystroke back to its own author with no existing mechanism to suppress that.
- **`buildAgentStateFromTab` doesn't read `tab.editor` today**, so a new `editorDraft` sibling field is automatically excluded from persisted `AgentState` as long as no one later adds it there (`src/tab-agent-state.ts:5-28`).
- **Existing debounce precedents in this codebase are all server-side reactions to filesystem events** (`src/file-tree-manager.ts:8`, `DEBOUNCE_MS = 100`; `src/editor-watch-manager.ts:5`, `DEBOUNCE_MS = 100`), not client-to-server sync debounces — there's no existing "debounce a network call after user input" pattern to copy verbatim; `useSyntaxHighlight.ts`'s 100ms is the closest analog but is explicitly local-only (Decision 3).
- **The buffer can change without a keystroke.** When the watched file changes on disk while the buffer is *clean*, `EditorTab.tsx` re-fetches and calls `api.load(text, line)` (`EditorTab.tsx:88-97`), replacing the whole `EditorState`. A sync hook keyed on `state` (Proposed change 7) picks this up for free, keeping the server draft coherent with the reloaded buffer; a hook wired to keydown events would miss it.
- **`src/tab-view.test.ts` does not exist today**; the exclusion test in Implementation order step 6 is a new file, not an extension.
- **`JanusClient` already has both client-call shapes this plan needs**: fire-and-forget named methods built on `send()` (`ws.ts:75`, `renameTab(index, title): void { this.send({ ... }) }`) and reply-awaiting ones built on the `pending` map (`ws.ts:79-86`, `saveFile`). `editorSync` uses the first shape.

## Proposed changes

### 1. `src/protocol.ts`

Add to `RpcCall` next to `saveFile` (`protocol.ts:125`):
```ts
// Sync an editor tab's in-progress (unsaved) buffer to the server as transient draft
// state, debounced client-side after typing pauses. Never written to disk — see saveFile
// for that. `url` identifies the tab the same way saveFile's does.
| { method: 'editorSync'; params: { url: string; content: string } }
```

### 2. `src/types.ts`

Add next to `editor?: EditorView` on `Tab` (`types.ts:161-162`):
```ts
// Transient, unsaved buffer content synced from the client shortly after typing pauses
// (see editor-live-buffer-sync plan). In-memory only; never sent to any client (not part
// of TabView) and never read when building persisted AgentState. Cleared on save.
editorDraft?: { content: string; updatedAt: number };
```

### 3. New file — `src/editor-sync.ts`

Mirrors `editor-save.ts`'s shape minus the filesystem write:
```ts
export function syncEditorBuffer(managers: Managers, url: string, content: string): void
```
Finds the tab via the same lookup `editor-save.ts` uses — `managers.tab.tabs.find((t) => t.editor?.url === url)` (`editor-save.ts:17`) — and sets `tab.editorDraft = { content, updatedAt: Date.now() }`. No `openFilePath` call, no filesystem access (Decision 2). No return value; no error path (an unresolvable `url` is simply a no-op, matching how a late/racing sync for an already-closed tab should behave — never throw for a tab that closed mid-debounce). Does **not** emit a `state` bus event: nothing client-visible changed, so triggering a full tab-state broadcast would be pure overhead.

### 4. `src/editor-save.ts`

After a successful write, clear the draft: `tab.editorDraft = undefined;` (Decision 4). The handler already holds the tab — `const tab = managers.tab.tabs.find((t) => t.editor?.url === url)` at `editor-save.ts:17` — so the clear is one line in the existing `if (tab...)` flow. A *failed* save needs no handling: `writeFileSync` (`editor-save.ts:14`) throws before that tab lookup is reached, so the draft survives failed saves with no extra code.

### 5. `src/message-handler.ts` + `src/controller.ts`

Add the `editorSync` case dispatching to a new `controller.syncEditorBuffer()`, mirroring the existing `saveFile` case (`message-handler.ts:49`, `controller.ts:115-116`).

### 6. `web/src/ws.ts`

Add a named fire-and-forget method `editorSync(url: string, content: string): void` on `JanusClient`, built on `this.send(...)` exactly like `renameTab` (`ws.ts:75`) — one line, no `pending` registration, no returned promise (Decision 7). Do **not** copy `saveFile`'s promise-based shape (`ws.ts:79-86`); there is no error to await.

### 7. New file — `web/src/editor/useEditorSync.ts`

A dedicated hook (not folded into `useEditor.ts` — same separation `useSyntaxHighlight.ts` has) taking the editor `state` (`EditorState | null`), the tab's `url`, and the `JanusClient`, returning nothing. Contract, in full:

- The effect is keyed on `state`, mirroring the shape of `useSyntaxHighlight.ts:21-38` (including clearing the timer in the effect cleanup).
- A ref holds the last-synced text. It is seeded from the **first** non-null `state` *without* sending — the initial load's content is identical to what's on disk, so syncing it is pointless (this replaces `useSyntaxHighlight`'s `loadedRef` first-pass special case with an equivalent one).
- Every subsequent `state` change resets a single 500ms timer (module-top constant, Decision 3).
- When the timer fires, compute `toText(state)`; if it equals the last-synced text, send nothing (this makes cursor-only moves and selections — which also produce new `EditorState` objects — free); otherwise call `client.editorSync(url, text)` and update the ref.
- The effect cleanup clears the pending timer, so unmounting/closing the tab mid-debounce cancels the sync (pairs with the server's no-op on unknown `url` for the race where the RPC was already sent).

Because it keys on `state`, all buffer-mutation routes are covered without enumeration: typing/paste (`insert`), undo/redo, kill/yank, and the external-change reload (`EditorTab.tsx:88-97`) — see the verified fact above. Wire-in is one import plus one hook call next to `useSyntaxHighlight` at `EditorTab.tsx:33`; keep it to exactly that, since `EditorTab.tsx` is at 203 raw lines and under the 200-line `max-lines` cap only because blanks/comments are skipped — all logic lives in the hook. No UI feedback (unlike the save-flash) — this is invisible infrastructure, not a user-facing action.

### 8. `src/tab-view.ts`

No code change required, but add a code comment at `tab-view.ts:40` (`editor: tab.editor`) noting that `Tab.editorDraft` is deliberately excluded from `TabView` — a one-line guardrail against a future change accidentally spreading `tab.editorDraft` into the broadcast object.

## Implementation order

1. Add `editorSync` to `RpcCall` (`protocol.ts`) and `editorDraft` to `Tab` (`types.ts`); typecheck.
2. Build `src/editor-sync.ts` + `src/editor-sync.test.ts` (unit: sets `editorDraft` with fresh `updatedAt`, no-ops on unknown `url`, doesn't touch the filesystem). Reuse the `setup()` pattern from `editor-save.test.ts:9-19` (`TabManager` + `registerFile` + `openEditorTab`).
3. Clear-on-save in `editor-save.ts` + extend `editor-save.test.ts` (a successful save clears a pre-existing `editorDraft`; a failed save leaves it intact).
4. Wire dispatch in `message-handler.ts`/`controller.ts`.
5. Add `JanusClient.editorSync` (`ws.ts`), then the `useEditorSync` hook + its one-line wiring into `EditorTab.tsx`, + `web/src/editor/useEditorSync.test.ts` modeled on `useSyntaxHighlight.test.ts` (`renderHook` + `vi.useFakeTimers`, see `useSyntaxHighlight.test.ts:16-22`): no send on initial load, one send after a 500ms pause across multiple rapid changes, no send when only the cursor moved, timer cancelled on unmount.
6. Add the exclusion comment in `tab-view.ts`; create `src/tab-view.test.ts` (none exists today) with a case asserting that a `Tab` with `editorDraft` set produces a `TabView` with no `editorDraft` key.
7. `./scripts/run.mjs check-diff` after each step; leave `npm run check` for the human at the end.
8. Once merged, revisit [[monitor-editor-tab-change-feed]]: update its `editorFeedEntries` to prefer `tab.editorDraft.content` over the on-disk read when a draft exists and is newer than the last content fed, and update Decision 6 / the spec paragraph accordingly.

## Out of scope

- **Actually consuming `editorDraft` in the monitor feed.** That's the follow-up integration step in [[monitor-editor-tab-change-feed]], deliberately left for after this plan lands so the two changes stay reviewable independently.
- **Multi-client collaborative editing / conflict resolution.** This plan gives the server a read-only-to-everyone-but-monitors copy of the buffer; it does not make the server authoritative for rendering, and does not attempt operational-transform or CRDT-style merge if two clients somehow edited the same tab.
- **Persisting the draft or restoring it on `--relaunch`.** Stays fully in-memory, matching every other editor-tab concern (Decision 5).
- **A response/error surface for `editorSync` beyond a bare success ack.** There's nothing failure-prone to report (Decision 7); if a real failure mode surfaces during implementation, handle it then rather than speculatively designing for it now.
- **Configurable debounce interval.** 500ms is a fixed constant for v1, matching how `MONITOR_FLUSH_MS`/`CAPTURE_DELAY_MS`/etc. are fixed constants elsewhere in this codebase.

## Verification

- `./scripts/run.mjs check-diff` after each step.
- Unit tests: `npm run test:diff:server` (`editor-sync.test.ts`, extended `editor-save.test.ts`, the new `tab-view.test.ts` exclusion case) and `npm run test:diff:web` (`useEditorSync.test.ts` — one send per pause, none on load or cursor-only changes).
- Manual end-to-end: open an editor tab, type without saving, confirm (via a temporary log line or debugger) that `tab.editorDraft.content` updates ~500ms after typing stops and not on every keystroke; save, confirm `editorDraft` clears; close the tab mid-typing (before the debounce fires) and confirm no error/crash from a sync racing a closed tab.
