# Remove launcher tab hover card

**Complexity: 3/10** — remove one presentational popup and preserve the row's existing hover behavior.

## Goal

Hovering a tab row in the launcher does not open an information popup.

## Approach

Remove `LauncherHoverCard`, its measured viewport anchor, and the `.launcher-hover` styles. Keep the row's existing hover highlight and let the CSS `:hover` state continue expanding a long status summary, so removing the card does not remove those useful row behaviors.

## Implementation steps

1. Remove the hover-card component and state from `web/src/plugins/launcher/LauncherTabRowView.tsx`; move summary expansion to the row's CSS `:hover` selector and remove the card rules from `launcher.css`.
2. Replace hover-card tests with a regression test that confirms hovering a row creates no tooltip.
3. Remove the hover-card behavior section from `product/specs/launcher.md`.
4. Run `./scripts/run.mjs check-diff`.

## Tests

- Hovering a launcher tab row does not render a tooltip.
- Existing tests continue to cover row highlighting, status summaries, and row focus.

## Out of scope

- Changing tab row contents, ordering, focus behavior, hover highlight, or summary expansion.
