# Center the command-line dot with the prompt text

**Complexity: 1/10** — one CSS line-height fix in `web/src/theme.css`.

## Goal

The busy-indicator dot (`●`) on the command line currently sits too high relative to
the `❯` prompt text next to it. It should sit vertically centered with that text,
matching how the same dot already looks centered in the tab label. The blink animation
itself is already shared and correct — only the vertical position needs fixing.

## Background (verified)

- `web/src/CommandInput.tsx:164` renders `<span className="dot...">●</span>` followed
  by a `<span>❯</span>` sibling, inside `.command` (`web/src/CommandInput.tsx:163`).
- `web/src/theme.css:263` — `.command { display: flex; align-items: flex-start; ... }`.
  `flex-start` is required here (not `center`) because the sibling `.input-wrap` grows
  tall for multi-line input; centering the whole row would drag the dot and `❯` down
  toward the middle of a multi-line textarea instead of staying pinned to its first line.
- `web/src/theme.css:264` — `.command .dot { font-size: 10px; line-height: 1.6; }` — box
  height ≈ 16px (10px × 1.6).
- `web/src/theme.css:266` — `.command .dot + span { line-height: 1.6; }` — this sibling
  span inherits the page default `font-size: 13.1625px` (`html, body, #root` at
  `theme.css:22`), giving it a box height ≈ 21px (13.1625px × 1.6).
- Because `.command` uses `align-items: flex-start`, both spans' line boxes start at the
  same top edge. Since the dot's box (16px) is shorter than the `❯` box (21px), the dot's
  glyph — vertically centered within its own smaller box — ends up ~2.5px above the
  center of the `❯` glyph. This is the reported misalignment.
- By contrast, `.tab .dot` (`theme.css:36`) sits in `.tab`, which uses
  `align-items: center` (`theme.css:31`) — with `center` alignment, box-height
  differences don't matter, so the tab dot already looks correctly centered. That is why
  only `.command .dot` needs a fix.
- The blink animation (`dot-blink`, defined once at `theme.css:103`) is already applied
  identically via `.tab .dot.busy` and `.command .dot.busy` (`theme.css:102`, `265`) — no
  changes needed there.

## Approach

Give `.command .dot` the same line-box height (in absolute pixels) as its `❯` sibling,
instead of a relative `line-height: 1.6` computed off the dot's own smaller font-size.
With equal box heights and shared `flex-start` top alignment, the two glyphs' vertical
centers will line up.

## Implementation

1. **`web/src/theme.css:264`** — change
   `.command .dot { font-size: 10px; line-height: 1.6; }`
   to
   `.command .dot { font-size: 10px; line-height: 21px; }`
   (21px = 13.1625px × 1.6, matching the computed line box height of
   `.command .dot + span` and the textarea/ghost text at `theme.css:272`).

## Tests

No new automated tests — this is a pure CSS visual-alignment fix with no behavioral or
DOM-structure change, and jsdom (used by the existing `CommandInput.test.tsx` suite)
does not perform real layout, so it cannot assert on pixel-level vertical centering.
Existing tests (`CommandInput.test.tsx` — `CommandInput — busy` describe block) already
cover that the `.dot.busy` class is applied/removed correctly; that behavior is
untouched by this change.

## Verification

Manual: run the web app, open a tab, and visually confirm the dot next to `❯`/`queue ❯`
is vertically centered with that text, both idle and busy (blinking). Not runnable in
this environment — note as unverified manually if so.

## Out of scope

- The tab-label dot (`.tab .dot`) — already correctly centered via `align-items: center`.
- The blink animation/timing — already shared and correct.
- Any other dot instances (`.tab-nav-picker .picker-row .dot`).
