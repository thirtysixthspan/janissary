# Unread badge on inactive tabs

## Goal

When an **inactive** tab receives new transcript content — a message from another agent (`msg`/`broadcast`), ACP/agent output, or a shell/browser command finishing — a small **badge** appears on that tab's dot in the tab strip. The badge stays until the tab is visited, then clears. This gives at-a-glance awareness of which background agents have produced new output while you were elsewhere.

```
[● janus] [● claude•] [● opencode]   ← claude has unread output; janus is active/clean
   ^active         ^badge
```

The active tab never shows a badge (you're already looking at it). Switching to a badged tab — by click, `next`, Shift+←/→, or any path — clears it.

## Design decisions

**Source of truth lives on the server `Tab`, projected into `TabView`.** The feature description frames it as "a `hasUnread` boolean on `TabView`," but `TabView` is the derived wire type rebuilt on every state broadcast (`TabManager.view()`). The durable flag must live on the in-memory `Tab` model (like `scrollOffset` / `toolStepsExpanded`) and be projected into `TabView.hasUnread`. It is **in-memory only — not persisted** to agent state, so tabs rehydrate with no badge (same policy as `scrollOffset`).

**Mark via one `markUnread(label)` helper, not inline at `append`.** This is the crucial correctness point. "Set on append" is insufficient because two of the three triggers bypass `TabManager.append`:

| Trigger | Path | Goes through `TabManager.append`? |
|---|---|---|
| Message from another agent / command output | `agent-communication-manager`, `command-manager` → `tab.append()` | ✅ yes |
| ACP / agent-run output | `acp-manager` → `tab.append()` | ✅ yes |
| **Shell command finishes** | `shell-manager.run()` → `onDone` → `update(result, false)` (maintains `tab.log` directly) | ❌ no |
| **Browser / connection command finishes** | `tab.finishRunning()` (mutates the running entry in place) | ❌ no |

A single `TabManager.markUnread(label)` helper, called from each content-delivery site, keeps the rule in one place and covers all triggers. It sets `hasUnread` only when the target tab is **not** the active tab.

**Clear on the server, in `setActiveTab`.** The server owns `activeTab` and re-broadcasts state on every change, so clearing there means every activation path (click → `setActiveTab` RPC, `next` command, `moveTab` keyboard chord — all funnel through `setActiveTab`) clears the badge for free. The client stays a pure renderer.

**Badge is a sibling element, not a modifier on the blinking dot.** The busy state animates `.dot.busy` (opacity blink). A tab can be both busy and unread (e.g. a `msg` arrives while a command runs), so rendering the badge as a child of `.dot` would make it inherit the blink. Render it as a separate element positioned over the dot instead.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| In-memory per-tab UI flags (the pattern to mirror) | `src/types.ts:111` (`scrollOffset`), `:116` (`toolStepsExpanded`) |
| `Tab` model | `src/types.ts:81` |
| `TabView` wire type + re-exports | `src/protocol.ts:18` |
| `TabView` projection (add the field here) | `src/tab-manager.ts:244` (`view()`) |
| `append` (message/output path) | `src/tab-manager.ts:197` |
| `finishRunning` (browser/connection completion) | `src/tab-manager.ts:174` |
| `setActiveTab` (the single clear point) | `src/tab-manager.ts:98` |
| `reorderTab` / `closeTab` (set `activeTab` directly — see below) | `src/tab-manager.ts:108`, `:120` |
| Shell completion callback (needs `markUnread`) | `src/shell-manager.ts:83` (`onDone`) |
| Tab-strip dot render | `web/src/TabStrip.tsx:21` |
| Dot / busy CSS to mirror | `web/src/theme.css:35` (`.tab .dot`), `:96` (`.dot.busy`) |
| Tab-strip test patterns + `makeTab` helper | `web/src/TabStrip.test.tsx:8` (helper), `:81` (busy-class test to mirror) |

## Data model

- **`src/types.ts`** — add to `Tab` (near `scrollOffset` / `toolStepsExpanded`, ~`:111`):
  ```ts
  // Set when new transcript content arrives on this tab while it is NOT the active tab; cleared
  // when the tab is activated. Drives the unread badge in the tab strip. In-memory only (like
  // scrollOffset) — not persisted to agent state.
  hasUnread?: boolean;
  ```
- **`src/protocol.ts`** — add to `TabView` (~`:24`, alongside `busy`):
  ```ts
  // True when the tab has unseen output (see Tab.hasUnread). Drives the tab-strip badge.
  hasUnread: boolean;
  ```
  Make it required and always project it (mirrors `busy`), so the wire type stays explicit.

## Server changes

1. **`src/tab-manager.ts` — add `markUnread` + a small active-label helper:**
   ```ts
   private activeLabel(): string | undefined {
     return this.tabs[this.activeTab]?.label;
   }

   markUnread(label: string): void {
     if (label === this.activeLabel()) return;
     const tab = this.tabs.find((t) => t.label === label);
     if (tab) tab.hasUnread = true;
   }
   ```
   `markUnread` does **not** emit `state` dirty itself — every call site already emits one right after appending content, so the flag rides the existing broadcast. (Keeping it side-effect-free also makes it safe to call from `shell-manager` mid-stream.)

2. **`src/tab-manager.ts:197` `append`** — after appending, mark unread:
   ```ts
   this.markUnread(label);
   messageBus.emit('state', { type: 'dirty' });
   ```
   Covers `msg`/`broadcast`, command output, ACP/agent output, and `startRunning` (a new message arriving = the running input entry appended on the target tab).

3. **`src/tab-manager.ts:174` `finishRunning`** — add `this.markUnread(label);` before the final `emit('state', …)`. Covers browser/connection command completion.

4. **`src/shell-manager.ts:83` `onDone`** — add `this.managers.tab.markUnread(label);` inside `onDone` (after `update(result, false)`). Covers a shell command finishing while its tab is not focused. Do **not** mark on `onChunk` — an in-progress command on an inactive tab is already conveyed by the busy dot; the badge signals *completed* new output.

5. **`src/tab-manager.ts:98` `setActiveTab`** — clear the newly-active tab's flag:
   ```ts
   setActiveTab(index: number): void {
     if (index < 0 || index >= this.tabs.length) return;
     this.activeTab = index;
     const tab = this.tabs[index];
     if (tab) tab.hasUnread = false;
     messageBus.emit('state', { type: 'dirty' });
   }
   ```
   This is the single clear point for click / `next` / `moveTab`.

6. **`src/tab-manager.ts:244` `view()`** — project the flag: add `hasUnread: !!t.hasUnread,` to the mapped object (next to `busy`).

7. **`reorderTab` (`:108`) and `closeTab` (`:120`)** set `this.activeTab` directly rather than calling `setActiveTab`. Add `this.tabs[<newActiveIndex>].hasUnread = false;` in each so activation via these paths also clears the badge (in `reorderTab` use `to`; in `closeTab` use the post-filter `this.activeTab`). Minor but keeps the invariant "the active tab is never badged" airtight.

## Web changes

8. **`web/src/TabStrip.tsx:21`** — render the badge next to the dot when unread. Make the dot a positioning context and add a sibling badge:
   ```tsx
   <span className="dot-wrap">
     <span className={`dot${tab.busy ? ' busy' : ''}`} style={{ color: tab.dotColor }}>●</span>
     {tab.hasUnread && <span className="tab-badge" aria-label="unread" />}
   </span>
   ```
   Gate on `tab.hasUnread` only — the server guarantees the active tab is already cleared, so no `index !== activeTab` check is needed on the client.

9. **`web/src/theme.css`** (near `:35`/`:96`) — badge styles:
   ```css
   .tab .dot-wrap { position: relative; display: inline-flex; }
   .tab .tab-badge {
     position: absolute; top: -2px; right: -3px;
     width: 6px; height: 6px; border-radius: 50%;
     background: var(--accent); /* or a fixed unread color if no accent var exists */
   }
   ```
   Confirm an accent/notification color variable exists in `theme.css`; if not, use a literal (e.g. `#5b9cff`). The badge is a sibling of `.dot`, so the `.dot.busy` blink does not affect it.

## Tests

- **`web/src/TabStrip.test.tsx`** — add `hasUnread: false` to the `makeTab` helper default (`:8`) if `hasUnread` is made required on `TabView` (keeps every existing test compiling). Add a test mirroring the busy-class test (`:81`):
  ```ts
  it('shows the unread badge when hasUnread is set', () => {
    const { container } = render(
      <TabStrip tabs={[makeTab({ hasUnread: true })]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    expect(container.querySelector('.tab-badge')).toBeInTheDocument();
  });
  it('shows no badge when hasUnread is false', () => {
    const { container } = render(
      <TabStrip tabs={[makeTab({ hasUnread: false })]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    expect(container.querySelector('.tab-badge')).not.toBeInTheDocument();
  });
  ```
- **`src/tab.test.ts` / `src/controller.test.ts`** — cover the server logic (whichever suite already exercises `TabManager`):
  - `append`/`finishRunning` to a **non-active** tab sets `hasUnread` and the flag surfaces in `view()`; to the **active** tab it does not.
  - `setActiveTab(i)` clears `hasUnread` on tab `i`.
  - A shell command finishing on an inactive tab marks it unread (drive `shell-manager`'s `onDone`, or assert `markUnread` is invoked from that path).

## Verification

- `./scripts/run.mjs check-diff` — lints changed files, incrementally typechecks affected projects, and runs the related server + web tests.
- Manual: launch the app; open a second agent (`agent foo`) and a harness/shell tab. From the active tab, `msg foo hello` (or run a long shell command on `foo`, then switch away). Confirm a badge appears on `foo`'s dot while it is inactive, that it clears the moment you switch to `foo` (click / `next` / Shift+→), and that the active tab never badges. Verify a badged tab that is also busy shows the badge without it inheriting the dot blink.

## Out of scope

- **Harness / interactive-PTY output.** Full-tab harness and `activePty` tabs stream via `pty` events, not transcript appends, so they won't badge. Not part of the "new message / shell command finishes" scope; addable later by hooking the PTY data path.
- **Unread counts.** A single boolean badge, not an N-message counter.
- **Persistence.** `hasUnread` is in-memory only; a restart/rehydrate starts every tab clean (consistent with `scrollOffset` / `toolStepsExpanded`).

## Optional follow-up

- If a functional spec exists for the tab strip under `spec/`, add a short note describing the unread badge alongside the busy-dot behavior.
