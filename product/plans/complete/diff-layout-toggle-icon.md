# Refine: combine the diff layout controls

**Complexity: 2/10** — replace two adjacent layout buttons with one accessible toggle using Font Awesome.

## Goal

The diff header uses one plus-minus icon button to switch between unified and split layouts.

## Approach

Keep the server-owned layout preference and layout intent unchanged. Render Font Awesome's plus-minus glyph in one button, expose the active layout through `aria-pressed`, and name the next layout in the button's tooltip. The lazy-loaded diff plugin imports the glyph directly because plugin boundaries prohibit imports from the app's shared icon registry. Update the existing layout interaction test and the diff behavior spec.

## Implementation steps

1. Replace the two layout buttons with one toggle using Font Awesome's plus-minus icon.
2. Update the layout control test to cover both current layouts, icon, accessible state, tooltip, and requested intent.
3. Update `product/specs/diff-tab.md` to describe the single toggle.

## Tests

- Unified mode marks the toggle unpressed and clicking requests split mode.
- Split mode marks the toggle pressed and clicking requests unified mode.
- The control renders the Font Awesome plus-minus glyph and describes the target layout.

## Out of scope

- Changing layout persistence or diff rendering.
- Other diff controls and public documentation that does not describe the layout buttons.
