# Editor tab scroll retention

**Complexity: 3/10** — one new hook in the editor feature, three lines in `EditorTab.tsx`, one prop threaded through `MountedViewLayers`, and a focus option. No server change, no wire-type change, no new state on the tab record.

The spec already promises this (`product/specs/editor-tab.md`, "Scrolling": *"Switching away from an editor tab and back leaves its scroll position exactly as it was"*), and `EditorTab.tsx` and `MountedViewLayers.tsx` both carry comments saying scroll position survives a tab switch. It does not. Leaving an editor tab scrolled halfway down a file and coming back shows the top of the file, with the caret still on its old line but off screen.

Two separate things throw the position away.

**The hidden body has no layout.** `MountedViewLayers` keeps every editor tab mounted and hides the inactive ones with `display: none`. A box that is not generated has no scroll offset, so the browser drops `scrollTop` the moment the tab is hidden and shows it back at zero. Staying mounted preserves the buffer, the undo stack, and the cursor — all of which live in React state — but scroll position lives in the DOM, and that is exactly the part `display: none` discards.

**Refocusing the hidden textarea scrolls the body to the top.** `.editor-textarea` is `position: absolute; left: 0; top: 0` inside the scrollable `.editor-body`, so on a scrolled buffer it sits above the visible region. The activation effect calls `textareaRef.current?.focus()`, and a plain `focus()` scrolls the focused element into view — which means scrolling the body back to zero. The same call happens on a body click, but that path moves the cursor, so the caret effect immediately scrolls back and hides the jump. On reactivation the cursor has not moved, `keepCaretRowVisible` deliberately does nothing, and nothing puts the view back.

## Goal

Switching away from an editor tab and back leaves the view exactly where it was left, with the caret on the same line and column it had before, and with no scroll correction of its own.

## Approach

**Record the offset while the tab is on screen; write it back the frame it returns.** The body fires a scroll event for every wheel, drag, key, and programmatic scroll, so a handler on `.editor-body` that stashes `scrollTop` in a ref keeps a current value at no render cost. Restoring it in a layout effect keyed on visibility puts the offset back after React has flipped `display` and before the browser paints, so there is no flash of the top of the file.

**Key the retention on visibility, not on focus.** `display` is driven by `visibleLabels`, not by which tab is current. In a split, an editor tab can be on screen without being the focused one, and it can be hidden while the focus sits in the other pane. Restoring on `active` would miss both. `MountedViewLayers` already computes `visibleLabels.includes(t.label)` for the wrapper's style and already passes the same value to `HarnessTabLayer` and `PluginTabLayer` as a `visible` prop, so the editor tab takes it the same way.

**Guard the recorder with the same flag.** A scroll event that arrives while the tab is hidden can only report zero, and recording that would defeat the restore. The handler writes the ref only while the tab is visible.

**Ask the browser not to scroll on the activation focus.** `focus({ preventScroll: true })` keeps the refocus from dragging the off-screen textarea into view. Only the activation effect changes — the mouse and find-overlay focus calls run on paths that move the cursor and are corrected by the caret effect, and leaving them alone keeps this change to the one path that is broken.

**Nothing moves to the server.** Scroll position is the textbook ephemeral, view-local concern architecture principle 1 leaves with the client, and it stays in a ref inside the tab that owns it.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Persistent mounting and the `display: none` that costs the offset | `web/src/MountedViewLayers.tsx` (`TabBodyDiv`) |
| The `visible` prop precedent on the other mounted layers | `web/src/MountedViewLayers.tsx` (`HarnessTabLayer`, `PluginTabLayer`) |
| The activation focus effect and the caret scroll effect | `web/src/editor/EditorTab.tsx` |
| Cursor-move scrolling, deliberately inert on reactivation | `web/src/editor/scroll.ts` (`keepCaretRowVisible`) |
| Hook test style (`renderHook` + `rerender`) | `web/src/editor/useEditorSync.test.ts` |

## Implementation steps

1. **Add `web/src/editor/useEditorScrollRetention.ts`.** A hook taking the body ref and a `visible` flag. It owns a `useRef(0)` offset, returns an `onScroll` handler that records `body.scrollTop` while visible, and runs a `useLayoutEffect` on `visible` that writes the offset back to `body.scrollTop` when the tab becomes visible. Header comment explains why the offset cannot simply live in the DOM.

2. **Wire it into `EditorTab.tsx`.** Take a new optional `visible` prop defaulting to `true` (a standalone render is on screen), call the hook, and put the returned handler on the `.editor-body` div's `onScroll`. Declare the hook call above the existing caret effect so the restore lands before any cursor-driven correction.

3. **Add `preventScroll` to the activation focus.** `textareaRef.current?.focus({ preventScroll: true })` in the `[active, loaded]` effect.

4. **Pass `visible` from `MountedViewLayers`.** `visible={visibleLabels.includes(t.label)}` on the `EditorTab` element, matching what `TabBodyDiv` already computes for the same tab.

## Tests

- `web/src/editor/useEditorScrollRetention.test.ts` — new file: the handler records the body's offset while visible; the offset is written back when `visible` goes false then true (with the body's `scrollTop` zeroed in between, as a hidden box's would be); a scroll event arriving while hidden does not overwrite the recorded offset; a tab that was never hidden is not disturbed.
- `web/src/editor/EditorTab.test.tsx` — the regression: scroll the body, fire its scroll event, rerender hidden, zero `scrollTop` the way the browser does, rerender visible, and assert the offset is back.
- `web/src/editor/EditorTab.test.tsx` — the caret keeps its line and column across the same round trip, and no `scrollIntoView` is triggered by the return (the existing reactivation case pins the second half; this adds the caret assertion).
- `web/src/editor/EditorTab.test.tsx` — the activation focus asks for `preventScroll`, so refocusing the off-screen textarea cannot pull the body back to the top.
- `web/src/MountedViewLayers.test.tsx` — the editor layer passes `visible` matching the wrapper's own `display`.

## Out of scope

- **Horizontal scroll position.** Lines soft-wrap, so the body never scrolls horizontally.
- **Restoring scroll position across a page reload or an app restart.** Nothing is persisted; a reopened tab still follows the open-time rules (top of file, or centred on a `path:line` target).
- **The mouse and find-overlay focus calls.** They move the cursor and are already corrected by the caret effect.
- **Repositioning `.editor-textarea`.** Moving it out of the scrollport would be a wider CSS change touching selection, IME, and paste behavior.
- **Harness, plugin, and monitor tabs.** Their bodies own their own scroll behavior and are not part of this issue.
