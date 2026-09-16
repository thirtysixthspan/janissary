# PR 1129 — the context menu opens with Copy once a drag completes

Complexity: 6/10

## Goal

Backlog entry: "once the selection layer is drag is complete, the context menu should appear and include a copy option."

Today, finishing a Shift+drag over a harness/terminal surface only freezes the overlay; nothing else happens until the user explicitly right-clicks, and even then the default menu explicitly withholds Copy for a terminal selection (`defaultMenuGroups` in `web/src/context-menu/default-menu-target.ts` excludes it, matching `product/specs/context-menu.md` and `product/specs/harness.md`, which both currently document "no Copy" for terminal selections). The fix changes both: releasing a drag that picks non-empty text should open the same default menu the surface would show on a real right-click, positioned at the release point, and that menu should offer **Copy** for a terminal selection just as it does for DOM/editor text.

## Approach

`useSelectionLayer`'s `end()` already tells a real released drag (`dragging`) apart from an internal reset, and already knows whether the release picked anything (`layerHolds`). Reuse that: when a real drag ends holding text, dispatch a genuine, bubbling `contextmenu` `MouseEvent` from the surface's container at the release's `clientX`/`clientY`. The app's existing default-menu wiring (`useDefaultContextMenu`'s document-level `contextmenu` listener, mounted once by `AppShell` via `DefaultContextMenu`) already resolves a terminal's held selection through the same `terminal-selection.ts` registry `useXterm` feeds — so a dispatched event opens the identical menu a right-click would, no new plumbing required for positioning, dismissal, or the existing "Chat about this" contributed entry.

The only behavioural change needed elsewhere is `defaultMenuGroups`: drop the `selectionSource !== 'terminal'` guard on the Copy entry, since the "terminal selection" it reads is always Janissary's own held layer text (never a raw, uncopyable native selection — `terminal-selection.ts`'s registry is populated by the same `useSelectionLayer`/`term.getSelection()` pair either way), so writing it to the clipboard through the existing `copyText` action is exactly as sound as it is for DOM/editor text.

`end()` is already registered directly as the `pointerup` listener, so it already receives the `PointerEvent` (a `MouseEvent` subtype) with real coordinates — no new listener wiring, just widening `end`'s signature to accept it and use it only on the "real drag, non-empty pick" branch.

## Implementation steps

1. `web/src/shared/terminal/useSelectionLayer.ts`: change `end` to `end(e?: MouseEvent)`. After the existing `dragging`/`layerHolds` branch that clears an empty pick, add: when `dragging` and the pick holds text, dispatch `container.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: e?.clientX ?? 0, clientY: e?.clientY ?? 0 }))`. The internal `end()` call from `onDown` (resetting a stale overlay before a new drag starts) passes no event and never has `dragging` true at that point, so it never dispatches.
2. `web/src/context-menu/default-menu-target.ts`: in `defaultMenuGroups`, drop the `(target.selectionSource ?? 'dom') !== 'terminal'` condition from `copyEntry`, so Copy shows whenever `selectionText` is non-empty regardless of source. Update the type's doc comment (`DefaultMenuTarget`) accordingly.
3. `product/specs/context-menu.md`: replace the "no Copy" carve-out in "A contributed entry" — a terminal's right-click menu now offers Copy alongside Chat about this — and update "The default menu" / "Relationship to the copy and paste shortcuts" sections that state a terminal's menu offers no Copy.
4. `product/specs/harness.md`: update "Selecting and copying terminal text" — releasing a Shift+drag that picks text opens the default menu automatically at the release point (in addition to right-click still opening it), and that menu now offers Copy as well as Chat about this.

## Tests

- `web/src/shared/terminal/useSelectionLayer.test.tsx`: a completed drag that picks text dispatches a `contextmenu` event on the container carrying the release coordinates; a drag that picks nothing (zero-length) dispatches none; a `pointerup` outside the container that ends no active drag dispatches none.
- `web/src/context-menu/default-menu-target.test.ts`: `defaultMenuGroups` includes Copy for `selectionSource: 'terminal'` when `selectionText` is non-empty.

Out of scope: distinguishing a synthetic auto-opened menu's contents from a manually right-clicked one (they are the same menu); changing what closes/dismisses the menu; the per-character colour/spacing fidelity of the frozen overlay itself (a separate, unresolved backlog entry).
