# Closing the active tab restores focus to the previously focused tab

**Complexity: 5/10** — no new UI or data model, but correctness depends on threading one small
piece of state (a focus-history stack) through every place `TabManager` changes which tab is
active, not just `closeTab` itself, since several tab-opening paths bypass `setActiveTab`.

## Goal

When the **active** tab is closed (e.g. an editor tab opened via `edit`, then closed with its
close button or Cmd/Ctrl+W), focus should return to whichever tab was focused **immediately
before** the closed tab became active — not just "whatever tab happens to occupy the resulting
array slot," which is today's behavior and often lands on the wrong tab.

## Current behavior (confirmed)

`src/tab/manager.ts`'s `closeTab(index)` always does:
```ts
this.activeTab = Math.min(this.activeTab, this.tabs.length - 1);
```
after removing the closed tab and renumbering. This has no notion of "what was focused before" —
it just clamps to the nearest surviving index. Concretely: open `janus` (tab 0), then `agent bob`
(tab 1, auto-focused), then `agent carol` (tab 2, auto-focused), then switch back to `janus`, then
open/focus `bob` again. Closing `bob` today lands on `carol` (the tab that slides into `bob`'s old
slot), not `janus` (the tab that was actually focused right before `bob`).

## Design

Add a small **focus-history stack** (`string[]` of tab labels, most-recent-last) to `TabManager`.
Every time the active tab genuinely changes to a *different* tab (not a reorder, which keeps the
same logical tab active), the tab being left is pushed onto the stack (de-duplicating any prior
occurrence, so a tab only ever appears once, at its most recent "was active" position). Closing
the active tab pops the stack — skipping any label that no longer exists or is now docked — and
restores focus to the first valid entry; if the stack is exhausted, it falls back to today's
clamp behavior unchanged.

**Why more than `closeTab` needs to change:** tabs are frequently auto-focused the moment they're
created (`edit path` opens a new editor tab and focuses it immediately; the same is true for
markdown/image/page/files/notifications tabs). That auto-focus is today applied via direct
`this.activeTab = ...` / `target.activeTab = ...` assignment in `tab/manager.ts` and
`tab/openers.ts`'s shared `activate()` helper and `openEditorTab()` — bypassing `setActiveTab`
entirely. If the history stack were only updated inside `setActiveTab`, opening a fresh editor
tab and immediately closing it would never have recorded what was focused beforehand, and the fix
would silently fail for the exact scenario the issue describes. So every one of those
direct-assignment sites needs to record the outgoing tab through the same helper.

**What's deliberately left alone:** `reorderTab` (moving the active tab left/right in the strip
keeps the same logical tab active — no real focus change, so no history entry) and the initial
`rehydrate()` reset to tab 0 (startup, no meaningful "previous" tab yet). Two more direct
`managers.tab.activeTab = ...` assignments exist outside `tab/`, in `src/harness/manager.ts:109`
and `src/ssh-manager.ts:35` (spawning a harness/SSH tab focuses it) — these are out of scope (see
below); closing a freshly spawned harness/SSH tab keeps today's clamp-based fallback.

## Implementation steps

1. **`src/tab/manager.ts`** — add the stack and two small private helpers, alongside the existing
   private fields (`cwd`, `busy`, etc., ~line 23):
   ```ts
   private focusHistory: string[] = [];
   ```

   ```ts
   // Records that `this.activeTab` is about to stop being active in favor of `newIndex`, so
   // closing `newIndex` later can restore focus to it. No-ops if `newIndex` is already active.
   private recordLeavingActiveTab(newIndex: number): void {
     if (newIndex === this.activeTab) return;
     const leaving = this.tabs[this.activeTab]?.label;
     if (!leaving) return;
     this.focusHistory = this.focusHistory.filter((l) => l !== leaving);
     this.focusHistory.push(leaving);
   }

   // Pops the most recent still-valid (existing, non-docked) label off the history stack,
   // discarding any stale entries (closed or since-docked tabs) along the way.
   private popFocusHistory(): number | undefined {
     while (this.focusHistory.length > 0) {
       const label = this.focusHistory.pop();
       const index = this.tabs.findIndex((t) => t.label === label);
       if (index !== -1 && !this.tabs[index].dock) return index;
     }
     return undefined;
   }
   ```

2. **`src/tab/manager.ts` `setActiveTab`** (~line 142) — record before switching:
   ```ts
   setActiveTab(index: number): void {
     if (index < 0 || index >= this.tabs.length) return;
     if (this.tabs[index]?.dock) return; // a docked tab is never the active tab
     this.recordLeavingActiveTab(index);
     this.activeTab = index;
     const tab = this.tabs[index];
     if (tab) tab.hasUnread = false;
     messageBus.emit('state', { type: 'dirty' });
   }
   ```
   This alone covers click-to-focus, the `next` command, the Shift+←/→ `moveTab` chord (which
   calls `setActiveTab` internally), and the Ctrl+G tab-nav picker — all funnel through here.

3. **`src/tab/manager.ts` `setDock`** (~line 166, the undock branch) and **`activateNearestNonDocked`**
   (~line 183, used when docking the *active* tab away) — record before assigning:
   ```ts
   if (dock === null) {
     tab.dock = undefined;
     this.recordLeavingActiveTab(index);
     this.activeTab = index;
     tab.hasUnread = false;
     messageBus.emit('state', { type: 'dirty' });
     return;
   }
   ```
   ```ts
   private activateNearestNonDocked(): void {
     const total = this.tabs.length;
     for (let step = 0; step < total; step++) {
       const index = (this.activeTab + step) % total;
       if (!this.tabs[index]?.dock) { this.recordLeavingActiveTab(index); this.activeTab = index; return; }
     }
   }
   ```

4. **`src/tab/manager.ts`** — add a method the tab-creation flows can call instead of assigning
   `activeTab` directly, so newly created/auto-focused tabs also get recorded:
   ```ts
   // Applies the result of adding a new tab (or focusing an existing one) — used by the tab
   // opener helpers in `openers.ts`, which otherwise assign `tabs`/`activeTab` directly and would
   // bypass focus-history tracking.
   applyOpenResult(result: { tabs: Tab[]; activeTab: number }): void {
     this.recordLeavingActiveTab(result.activeTab);
     this.tabs = result.tabs;
     this.activeTab = result.activeTab;
   }
   ```

5. **`src/tab/openers.ts`** — add `applyOpenResult` to the structural `OpenTarget` interface, and
   route the two places that assign `target.activeTab` directly through it instead:
   ```ts
   interface OpenTarget {
     tabs: Tab[];
     activeTab: number;
     setActiveTab(index: number): void;
     applyOpenResult(result: { tabs: Tab[]; activeTab: number }): void;
   }

   function activate(target: OpenTarget, result: { tabs: Tab[]; activeTab: number }): void {
     target.applyOpenResult(result);
     messageBus.emit('state', { type: 'dirty' });
   }
   ```
   ```ts
   export function openEditorTab(
     target: OpenTarget, view: EditorView, watch: (label: string, path: string) => void,
   ): void {
     const existing = target.tabs.find((t) => t.editor?.path === view.path);
     if (existing) {
       if (view.line !== undefined) existing.editor!.line = view.line;
       target.setActiveTab(target.tabs.indexOf(existing));
       messageBus.emit('state', { type: 'dirty' });
       return;
     }
     const result = addEditorTab(target.tabs, target.activeTab, view);
     target.applyOpenResult(result);
     watch(result.tabs[result.activeTab].label, view.path);
     messageBus.emit('state', { type: 'dirty' });
   }
   ```
   `TabManager` already has a public `applyOpenResult` method (step 4) and satisfies this
   structurally — no change needed at the `TabManager.openXTab` call sites (`this` is still
   passed as `target`).

6. **`src/tab/manager.ts` `closeTab`** (~line 205) — use the history stack when the closed tab was
   the active one, falling back to today's clamp otherwise:
   ```ts
   closeTab(index: number): void {
     const tab = this.tabs[index];
     if (!tab) return;
     const nonDockedCount = this.tabs.filter((t) => !t.dock).length;
     closeTabResources(tab, this.managers, this.openFiles, this.context, this.queue, nonDockedCount);
     if (!tab.dock && nonDockedCount <= 1) {
       messageBus.emit('app', { type: 'exit' });
       return;
     }
     const wasActive = index === this.activeTab;
     this.focusHistory = this.focusHistory.filter((l) => l !== tab.label);
     this.tabs = this.tabs.filter((_, index_) => index_ !== index).map((t, index_) => ({ ...t, number: index_ + 1 }));
     const restored = wasActive ? this.popFocusHistory() : undefined;
     this.activeTab = restored ?? Math.min(this.activeTab, this.tabs.length - 1);
     const active = this.tabs[this.activeTab];
     if (active) active.hasUnread = false;
     messageBus.emit('state', { type: 'dirty' });
   }
   ```
   The `filter` before reindexing purges the closed tab's own label from the history stack (it
   can never be a valid restore target again). When `wasActive` is false, behavior is byte-for-byte
   unchanged from today (including its pre-existing index-shift quirk when closing a tab before
   the active one — out of scope; not introduced or worsened by this change).

## Tests

`src/tab/manager.test.ts` (unit-level, `TabManager` directly) and/or `src/controller.test.ts`
(the existing `Controller` describe blocks already exercise `dispatch`/`setActiveTab`/`closeTab`
together):

1. **Closing the active tab restores the tab that was active immediately before it, not just the
   adjacent slot** — the central regression test. Open `agent bob`, then `agent carol` (each
   auto-focuses), switch to `janus`, then to `bob`, then close `bob`: expect the active tab to be
   `janus`, not `carol` (which is what the old clamp-based logic would pick, since `carol` slides
   into `bob`'s old array slot).
2. **Opening a new editor tab and closing it immediately returns focus to the tab that was active
   before it opened** — using `TabManager.openEditorTab` directly (mirrors the existing
   `openEditorTab` tests in `manager.test.ts`), confirming the auto-focus-on-open path is recorded
   even though it bypasses `setActiveTab`.
3. **Closing the active tab with no recorded history falls back to today's clamp behavior** — a
   single tab beyond `janus`, closed with no prior `setActiveTab` calls, still resolves without
   throwing and lands on a valid tab.
4. **Closing a tab that is not the active one leaves the active tab's identity unaffected in the
   simple case** (existing coverage in `manager.test.ts`'s `'closeTab clears the label's queue
   entry'` test already exercises this indirectly; no new test needed beyond confirming it still
   passes).

## Verification

- `./scripts/run.mjs check-diff` — lints changed files, incrementally typechecks, and runs the
  affected server tests.
- Manual: not verifiable in this environment (no interactive terminal/browser session); the
  automated tests above exercise the exact activation/close sequences described.

## Out of scope

- `src/harness/manager.ts:109` and `src/ssh-manager.ts:35` — both directly assign
  `managers.tab.activeTab = ...` when spawning a harness/SSH tab. Bringing those onto the same
  history-tracking path is a reasonable follow-up but is a different subsystem than the tab
  openers this issue is about; closing a freshly spawned harness/SSH tab keeps today's
  clamp-based fallback.
- `reorderTab` — physically moving the active tab within the strip is not a focus change to a
  different tab, so it stays untouched.
- The pre-existing index-shift quirk in `closeTab` when closing a *non-active* tab positioned
  before the active one (the `Math.min` clamp doesn't account for the shift) — unrelated,
  unchanged, and not introduced by this fix.
- Any change to how tabs are rendered or focused in the DOM (`web/src/`) — this is a server-side
  activation-state fix; the client already just renders whatever `activeTab` the server reports.
