# Fix closeTab broadcasting a stale (pre-removal) tab list

**Complexity: 3/10** — a one-parameter fix to an already-isolated pure function
(`src/tab/close.ts`), matching a pattern already established and documented next door in
`src/tab/navigation-commands.ts`; no new architecture, confined to two files plus one test.

## Goal

Clicking a tab's close (×) button does nothing for editor tabs — confirmed via a manual
repro (see below) to actually be a bug in every tab close, not editor-specific; other tab
kinds mask it because something else (e.g. the closed PTY exiting) triggers a corrective
follow-up broadcast a moment later, while editor tabs never get one, so they stay visibly
stuck. Filed in `product/backlog/issues.md` as "tabs are not disappearing when the close
button is clicked."

## Root cause

`src/tab/close.ts`'s `closeTabOp` (extracted from `TabManager.closeTab` by the recent
`tabmanager-extract-close-rename` refactor) computes the post-removal tab list as a local
variable and emits the `state:dirty` event *before* returning that list to its caller:

```ts
const nextTabs = removeTabAt(tabs, index);
...
messageBus.emit('state', { type: 'dirty' });
return { tabs: nextTabs, activeTab: nextActiveTab };
```

`messageBus.emit` invokes its listeners synchronously (`src/bus.ts`), and the `state:dirty`
listener (`src/controller/events.ts`) immediately broadcasts a fresh snapshot built from
`TabManager.tabs` as it stands *at that instant*. Since `TabManager.closeTab` only assigns
`this.tabs = result.tabs` *after* `closeTabOp` returns, the broadcast fires while
`this.tabs` still holds the old, pre-removal array — so the client receives a snapshot
where the "closed" tab is still present. `TabManager.tabs` itself is correctly updated a
moment later, but nothing broadcasts that second change, so the client never learns about
it (unless something unrelated happens to trigger another `state:dirty` emit afterward).

The sibling `reorderTabOp` (`src/tab/navigation-commands.ts`) already documents the
required ordering in its file header comment — "callback ordering mirrors the original
inline implementations exactly, since some listeners read manager state synchronously off
the 'dirty' emit" — and follows it correctly by calling its `applyResult` callback (which
assigns `this.tabs`/`this.activeTab`) *before* emitting. `closeTabOp` is the one operation
that returns its result instead of applying it via callback first, which is what let this
regression slip through the extraction.

Confirmed by direct repro against a running server: opened two editor tabs over the raw
WebSocket protocol, sent `closeTab` for one, and the broadcast `state` event still listed
all three tabs (server process log showed the removal logic actually ran and returned the
correct 2-tab array — it just never reached the client).

## Approach

Change `closeTabOp` to take an `applyResult: (tabs: Tab[], activeTab: number) => void`
callback, matching `reorderTabOp`'s existing signature and invariant exactly, and call it
before the `state:dirty` emit instead of returning a value for the caller to apply
afterward.

## Implementation steps

1. **`src/tab/close.ts`** — add an `applyResult: (tabs: Tab[], activeTab: number) => void`
   parameter to `closeTabOp`; change the return type from
   `{ tabs: Tab[]; activeTab: number } | undefined` to `void`; call
   `applyResult(nextTabs, nextActiveTab)` immediately after computing `nextActiveTab`, before
   the `hasUnread` clear and the `state:dirty` emit. Update the function's header comment to
   describe the new invariant (mirroring `reorderTabOp`'s header comment).
2. **`src/tab/manager.ts`** — change `closeTab`'s call site to pass
   `(tabs, activeTab) => { this.tabs = tabs; this.activeTab = activeTab; }` as the new last
   argument instead of assigning from a returned value.

## Tests

Add one case to `src/tab/manager.test.ts`'s existing `closeTab`-related tests (near the
`'TabManager focus history'` describe block) asserting the *synchronous* visibility
invariant the bug violated:

- `'closing a tab makes the removal visible to a state:dirty listener registered before the
  close'` — subscribe a `messageBus.on('state', 'dirty', ...)` listener that snapshots
  `tm.tabs.length` (and/or `tm.tabs.map(t => t.label)`) at the moment it fires; call
  `tm.closeTab(index)`; assert the snapshot captured **inside the listener** already
  reflects the tab's removal (shorter `tabs.length`, closed label absent) — not just that
  `tm.tabs` looks right after `closeTab` returns, which the pre-fix code already got right
  and wouldn't catch this regression.

## Out of scope

- Any other `TabManager` operation (`renameTab`, `setDock`, `reorderTab`, etc.) — those
  already apply results before emitting and are unaffected.
- The delayed masking behavior in non-editor tab kinds (e.g. a PTY's own exit-driven
  broadcast) — not a bug in itself, just why this defect went unnoticed there.
