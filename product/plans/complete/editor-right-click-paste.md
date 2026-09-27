# Right-clicking an editor selection offers no Paste entry

**Complexity: 2/10**: the editor body's mousedown handler stops ignoring the secondary button. No context-menu code changes.

## Bug

Right-clicking a selection in an editor tab opens the default context menu with Copy and Chat about this, but no Paste. The spec says "Right-clicking an editor selection leaves that selection unchanged and offers **Copy**, **Paste**, and **Chat about this** in the default context menu". The same right-click also leaves the keyboard off the buffer, so typing stops reaching the editor afterwards.

## Root cause

`useEditorMouse`'s `onMouseDown` (`web/src/editor/useEditorMouse.ts`) returns at once for any button other than the primary one. It neither refocuses the textarea nor calls `preventDefault()`. The browser's default for a mousedown on the rendered lines, which are not focusable, then moves focus off the hidden textarea. When the `contextmenu` event follows, `resolvePasteTarget` (`web/src/context-menu/default-menu-target.ts`) finds no text-entry element under the click (a rendered line) or in `document.activeElement` (now `<body>`), so `defaultMenuGroups` leaves Paste out. Closing the menu restores focus to that same `<body>`, which is why typing stops working.

The primary button avoids this only because its path calls `focus()` and `preventDefault()`.

## Correct behavior

A right-click in the editor body keeps keyboard focus on the buffer's textarea and leaves the selection and caret unchanged. With a selection, the default menu offers Copy, Paste, and Chat about this; Paste lands in the buffer, and dismissing the menu hands the keyboard back to the buffer. With no selection, no menu opens, as before, and the buffer keeps the keyboard.

## Reproduction

In the attached browser against a workspace build (`node bin/janus.mjs --no-open temp/rc-proj`, driven with `./scripts/run.mjs e2e-driver`): run `edit notes.txt` on a file whose first line is `hello world`, double-click `hello`, then right-click inside the selection. Observed on `master`: the editor's selection is `hello`, focus before the right-click is the `editor-textarea`, and the menu that opens has exactly `Copy` and `Chat about this`. Once the menu is dismissed, focus does not return to the textarea.

## Approach

In `onMouseDown`, handle the secondary button (`button === 2`) before the primary-only guard. Call `focus()` so the buffer holds the keyboard, which also covers a right-click on an editor that did not have focus (the other pane of a split). Then call `preventDefault()` so the browser's default does not take focus away again, and return without touching the selection, the caret, undo sealing, or the query line. `preventDefault()` on `mousedown` does not suppress the `contextmenu` event that follows, so the default menu still opens. `EditorTab`'s own `onContextMenu` still cancels the menu when there is no selection.

Other non-primary buttons, such as the middle button, keep returning early, unchanged.

## Implementation steps

1. `web/src/editor/useEditorMouse.ts`: in `onMouseDown`, add the secondary-button branch described above ahead of the existing `button !== 0` guard.
2. Tests: update the existing right-click case in `useEditorMouse.test.ts` and add the regression tests below.
3. Spec: in `product/specs/editor-tab.md`, state that a right-click in the editor keeps keyboard focus on the buffer, so Paste has somewhere to land and typing continues after the menu closes.

## Regression test

- `web/src/editor/useEditorMouse.test.ts`, `keeps the keyboard in the buffer on a right-click without moving the selection` (replaces `leaves the selection alone on a right-click`, which asserted the buggy no-`preventDefault` behavior): a secondary-button mousedown calls `focus` and `preventDefault`, and does not call `setState` or `sealUndo`.
- `web/src/editor/EditorTab.test.tsx`, `a right-click on a selected line keeps the keyboard and the selection in the buffer`: with the textarea focused and a selection made, and then with focus moved to an outside input, a right-button mousedown on a rendered line is default-prevented, leaves the textarea as `document.activeElement`, and leaves `data-editor-selection` unchanged.

## Out of scope

- The default menu's target resolution in `default-menu-target.ts`, which is correct once the textarea holds focus.
- Middle-button and Ctrl+click behavior.
- The other editor bugs in the backlog: Cmd+/ round trip on blank lines, and Shift+Tab.
