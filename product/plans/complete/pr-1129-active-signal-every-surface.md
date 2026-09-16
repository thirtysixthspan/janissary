# PR 1129 — the inactive signal reaches every terminal surface's selection layer

Complexity: 4/10

## Goal

`ShellTab` calls `useXterm` without `active`, even though shell tabs stay mounted with
`display: none`, so the plan's clear-on-tab-switch reaches the shell surface only as a
side effect of a resize observation that may never come — a user returning to a shell
tab can meet a frozen snapshot with no explanation.

## Approach

`ShellTabLayer` already knows which tab is active (`t.label === activeLabel`, the same
comparison `HarnessTabLayer` runs); it passes an `active` prop into `ShellTab`, which
forwards it to `useXterm` — where the `inactive` threading into the selection layer
already exists on the path `HarnessTab` uses. The harness tab's clear-on-inactive and
clear-on-exit tests already cover the correctly wired surface and keep passing.

For `TerminalCard`, the decision the entry asks for is explicit: a terminal card inside
a transcript is not a switched-away surface — it is visible when its transcript line is,
hidden by scroll rather than by the layer's contract — so it clears on exit and resize
only, and the spec says so instead of asserting the tab-switch clear for it.

## Implementation steps

1. `web/src/ShellTabLayer.tsx`: pass `active={t.label === activeLabel}`.
2. `web/src/ShellTab.tsx`: accept `active?: boolean` and forward it to `useXterm`.
3. `product/specs/harness.md`: the cards-in-transcripts clause states exit-and-resize
   clearing for terminal cards, in place of the tab-switch wording the section repaired.
4. Tests: `web/src/ShellTab.test.tsx` asserts the hook is called with the surface's
   active value (true when active, false when not — the inactive side of it) alongside
   the existing ptyId assertions; `web/src/shared/transcript/TerminalCard.test.tsx`
   asserts the hook is called with the card's exited value.

Out of scope: threading a transcript-visibility signal down to cards (the explicit spec
decision covers it); exited-signal changes (already passed).
