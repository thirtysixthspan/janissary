# Fix: make the diff refresh button visible on dark backgrounds

**Complexity: 1/10** — one control's foreground and background styles, with a focused stylesheet assertion.

## Goal

The Refresh control in the diff metadata row has a light foreground on the dark application surface.

## Approach

Give `.diff-refresh` the theme's foreground color, transparent background, and the same compact button framing used by nearby controls. Add a stylesheet test and document the visible control treatment in the diff spec.

## Implementation steps

1. Style the refresh button with a light foreground and transparent background.
2. Add a regression assertion for its foreground and background styles.
3. Update `product/specs/diff-tab.md` to describe the refresh button's contrast.

## Tests

- The `.diff-refresh` rule sets `color: var(--fg)` and a transparent background.

## Out of scope

- Refresh behavior or any other diff controls.
- Public help and user documentation, which do not describe this styling.
