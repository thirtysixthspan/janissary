# Close a contributed overlay when the exposed tab changes

**Complexity: 2/10** — one seam helper and one effect in the hook that owns the overlay-plugin host, plus the label the app shell already has.

## Goal

The clipboard-history popup stays open across a tab switch today. It is anchored to the pane it opened on, takes every keystroke, and pastes into "the tab the user is looking at now", so leaving it up while the user moves to another tab carries a modal onto a tab the user never opened it on. The pull request backlog asks that a tab change close it.

## Approach

The open state of a contributed overlay lives in the shared seam `web/src/shared/contributed-overlays.ts`, and the hook `web/src/useOverlayPlugins.ts` is the app-shell owner of the overlay-plugin host. The hook gains a `tabLabel` option, the label of the exposed tab, and an effect keyed on it that closes every open contributed overlay. The seam gains `closeContributedOverlays()`, which closes each open registration and notifies once.

A label rather than the active index is the key, because closing a tab to the left of the exposed one shifts the index without changing what is on screen, and closing the exposed tab changes the label even when the index stays the same. The effect also runs on mount, when nothing can be open, so it needs no first-run guard.

The rule is written against contributed overlays in general rather than the clipboard plugin, because every contributed overlay is a modal over the exposed tab and the hook already owns all of them.

## Implementation steps

1. `web/src/shared/contributed-overlays.ts` — add `closeContributedOverlays()`: clear `open` and `anchor` on every open registration and notify once if any were open.
2. `web/src/useOverlayPlugins.ts` — add `tabLabel: string | undefined` to the options and `useEffect(() => { closeContributedOverlays(); }, [tabLabel])`; document why in the header comment.
3. `web/src/App.tsx` — pass `tabLabel: current?.label`.

## Tests

- `web/src/shared/contributed-overlays.test.ts`: `closeContributedOverlays` closes an open overlay, clears its anchor, and notifies; with nothing open it does not notify.
- `web/src/useOverlayPlugins.test.tsx`: an open overlay closes when `tabLabel` changes; it stays open across a rerender with the same label.

## Spec and docs

- `product/specs/clipboard-history.md` — state that switching to another tab closes the popup without pasting.
- `documentation/user-documentation/command-bar/clipboard.md` — the same sentence beside the existing Escape description.

## Out of scope

- Closing the built-in pickers on a tab change.
- Focus behavior after the close, which is a separate backlog entry.
