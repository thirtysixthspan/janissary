# Forward clicks to UI when app window is unfocused

## Problem

When the browser window is in the background and a user clicks on a tab or the transcript area to bring it forward, the browser may swallow the initial `click` event — it focuses the window but never delivers the click to the target element. This means clicking a hidden tab from a backgrounded window does not select it; the user must click twice.

## Complexity

2/10 — add `onMouseDown` handlers alongside existing `onClick` handlers in two places.

## Solution

The `mousedown` event fires before window focus and is reliably delivered even when the window was backgrounded. Add `onMouseDown` handlers mirroring the existing `onClick` handlers on:

1. The tab `<div>` in `TabItem.tsx` (line 34) — forwards the click to select the tab
2. The transcript body `<div>` in `App.tsx` (line 174) — forwards the click to focus the command input

The editor already uses this `onMouseDown` pattern successfully.

## Changes

### `web/src/TabItem.tsx`
- Add `onMouseDown={() => onSelect(index)}` on the tab `<div>` alongside the existing `onClick`.

### `web/src/App.tsx`
- Add `onMouseDown` on the transcript body `<div>` alongside the existing `onClick`, focusing the input.

## Spec

Covered by `specs/tabs.md` — the existing spec states clicking an inactive tab selects it. No change needed (this is an implementation fix for when the window is unfocused, not a user-visible behavior change).

## Out of scope
- No window-level `focus`/`blur` event listeners (unnecessary — mousedown handles it)
- No other click targets (close button, tab rename input, search bar — those are fine)
