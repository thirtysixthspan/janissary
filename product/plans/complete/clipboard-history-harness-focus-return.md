# Return the keyboard to the harness after pasting into it from the clipboard popup

**Complexity: 3/10** — one new injected callback on the paste capability, threaded from the app shell through the overlay-plugin hook the same way `currentTab` already is.

## Goal

The pull request backlog asks that after pasting into a harness tab from the clipboard popup, keyboard focus goes back to the harness, so the user can keep typing at the prompt they just pasted into.

## Approach

The previous two entries already cover the common case. The popup records the element that held the keyboard as it opens, and a plugin close hands focus back to it. When the harness terminal had focus at that moment, focus goes back to the terminal.

That leaves a gap. The PTY paste route is the one route that does not put focus anywhere itself, and it is chosen from the exposed tab rather than from the focused element. When the terminal did not hold the keyboard as the popup opened, focus goes back to wherever it was instead, often the page body. The command bar route and the editor route both focus their own surface as they paste. The PTY route should do the same.

So the paste capability gains a `focusHarness(ptyId)` callback, called after the `ptyInput` is sent. The app shell supplies it from the harness handles it already keeps for tab-switch focus (`harnessHandles`, keyed by PTY id). The overlay-plugin hook reads it through a ref, like `currentTab`, so the session-scoped host is not rebuilt when the caller passes a new closure. Once the terminal holds focus, the close's focus return leaves it there, because a different text field (xterm's input) now holds focus.

## Implementation steps

1. `web/src/paste-into-surface.ts` — add `focusHarness: (ptyId: string) => void` to `PasteCapabilityOptions` and call it from `pasteIntoPty` after sending.
2. `web/src/useOverlayPlugins.ts` — add a `focusHarness` option, held in a ref and passed to `createPasteCapability`.
3. `web/src/App.tsx` — pass a stable `focusHarness` that focuses `harnessHandles.current.get(ptyId)`.

## Tests

- `paste-into-surface.test.ts`: a harness paste focuses that harness through `focusHarness` with its PTY id; a paste that lands elsewhere does not call it.
- `overlay-plugins/clipboard-history/paste-routing.test.tsx`: with a harness tab exposed and its terminal focused when the popup opens, Return sends `ptyInput` and focus ends on the terminal. With the body focused when the popup opens, the terminal is focused through `focusHarness`.
- `useOverlayPlugins.test.tsx`: the host stays the same across rerenders that pass a new `focusHarness` closure (covered by the existing new-closures test once the option is part of `options()`).

## Spec and docs

- `product/specs/clipboard-history.md` — state that a paste into a harness or ssh terminal leaves the keyboard in that terminal.

## Out of scope

- Shell PTYs embedded in an agent tab, which the paste capability does not route to today.
