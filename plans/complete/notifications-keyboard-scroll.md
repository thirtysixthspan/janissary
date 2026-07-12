# Fix: the notifications feed can't be scrolled from the keyboard

**Complexity: 3/10** — a focused web-UI change: one small new key handler module plus wiring it into `NotificationsTab`, mirroring the existing `markdown-handlers.ts` scroll pattern. The only subtlety is that the notifications tab can be docked in a sidebar alongside an active tab, so the handler is scoped to the feed's keyboard focus (an element `onKeyDown`) rather than a global listener.

## Goal

The notifications feed can only be scrolled with the mouse wheel. It should also scroll from the keyboard: once the feed is focused, **Arrow Up/Down** scroll it a line at a time and **Page Up/Page Down** scroll it a page at a time. The feed can be focused with either the mouse (click) or the keyboard (tab), and only scrolls while it holds focus.

## Approach

Image and markdown view tabs already support keyboard scrolling via `markdown-handlers.ts` (`onMarkdownKey`): Arrow keys nudge `scrollTop` by a fixed step, Page keys by the element's `clientHeight`, each calling `preventDefault`. Those tabs attach the handler as a **global** `keydown` listener because they are only ever the single active center tab.

The notifications tab is different: it can be **docked** in a sidebar and rendered at the same time as a different active center tab. A global arrow-key listener would then scroll the docked feed while the user is typing or navigating elsewhere. So the notifications handler is attached as an element-level `onKeyDown` on the feed's already-focusable wrapper (`.notifications-tab` already has `tabIndex={0}`), meaning it fires only while the feed itself holds keyboard focus. Clicking the feed focuses it (native `tabIndex` behavior — the "mouse focus" path); tabbing to it focuses it (the "keyboard focus" path). The handler also calls `stopPropagation` for the keys it handles, so the feed's scroll keys never reach the window-level bindings, exactly as the editor does for its own keys.

The feed's scroll container is the `.transcript` div, which `NotificationsTab` already holds a ref to (`scrollRef`, passed to `Transcript`). The new handler scrolls that element. `NotificationsTab` passes `pinToBottom={false}`, so manual scrolling never fights an auto-scroll.

No global key handler conflicts: the app's only Arrow/Page handlers (`keyboard-handlers.ts`) belong to overlays (route chooser, command palette, queue popup, tab-nav) that are open only in their own modes, never while the notifications feed is focused and being scrolled.

## Implementation steps

1. Add `web/src/notifications-handlers.ts` exporting `onNotificationsKey(e: KeyboardEvent, container: HTMLDivElement | null): void`, modeled on `onMarkdownKey`: `ArrowUp`/`ArrowDown` adjust `scrollTop` by a fixed `LINE_STEP`, `PageUp`/`PageDown` by `container.clientHeight`, each calling `preventDefault`. A null container is a no-op.
2. In `NotificationsTab.tsx`, add `onKeyDown` to the `.notifications-tab` wrapper that calls `onNotificationsKey(e.nativeEvent, scrollRef.current)` and, for the four handled keys, `stopPropagation` so they don't reach global bindings.
3. Run `./scripts/run.mjs check-diff`.

## Tests (`web/src/NotificationsTab.test.tsx`)

Mirror `MarkdownTab.test.tsx`'s scroll tests, firing keydown on the feed wrapper and asserting the `.transcript` container's `scrollTop`:
- ArrowDown increases `scrollTop`; ArrowUp (from a positive `scrollTop`) decreases it.
- PageDown scrolls by the container's `clientHeight` (mock `clientHeight`); PageUp scrolls back up.
- The four handled keys call `preventDefault` (the fired event is cancelled).
- An unrelated key (e.g. a letter) leaves `scrollTop` unchanged and is not cancelled.

## Out of scope

- Image/markdown/other view tabs — their global-listener scrolling is unchanged; this fix touches only the notifications feed.
- A moving per-row selection/highlight cursor — arrows scroll the transcript (as the issue states), they do not move a selected row.
- Mouse-wheel scrolling — already works.
- `Home`/`End`/`Space` scrolling — only the Arrow and Page keys named in the issue are handled.

## Verification

- `./scripts/run.mjs check-diff` passes (lint, typecheck, web tests).
- Manual: open `notifications`, click the feed (or tab to it), and confirm Arrow Up/Down and Page Up/Down scroll it; confirm a docked notifications feed does not scroll while another tab is focused. Not runnable headless here; covered by the component scroll tests.
