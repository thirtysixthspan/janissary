# File search ghost text alignment

**Complexity: 1/10** — CSS-only fix; one property change in `theme.css`.

## Goal

In the file navigator's Search-files pop-up (`FileSearchPopup`), the typed text in the input and the ghost completion overlay behind it are not aligned horizontally — the ghost text starts slightly to the right of the real input text.

## Background

`FileSearchPopup` renders a `.ghost` overlay `<span>` absolutely positioned behind the real `<input>` (`web/src/FileSearchPopup.tsx`), the same pattern `CommandInput` uses for its ghost-history overlay behind a `<textarea>`.

For the `CommandInput` case, `.command textarea` in `web/src/theme.css` explicitly sets `padding: 0`, matching the ghost span's implicit zero padding, so the two stay aligned.

For `FileSearchPopup`, the corresponding rule `.file-search-popup .command input` (`web/src/theme.css:650`) sets `background`, `border`, `outline`, `color`, and font properties, but never resets `padding`. Native `<input>` elements carry non-zero user-agent default padding, so the typed text renders shifted right relative to the ghost span's text, which has no padding.

## Approach

Add `padding: 0;` to `.file-search-popup .command input` in `web/src/theme.css`, matching the pattern already used for `.command textarea`.

## Implementation steps

1. **Update input CSS** — in `web/src/theme.css`, add `padding: 0;` to the `.file-search-popup .command input` rule.
2. **Run `./scripts/run.mjs check-diff`**.

## Testing

CSS-only change with no functional impact on tests. Existing tests continue to pass — the input element is still rendered with the same className and structure; only the visual text position changes to match the ghost overlay.

## Out of scope

- Changing font size, color, or the ghost suggestion logic itself.
- Any other alignment issues in the file navigator.

## Verification

`./scripts/run.mjs check-diff` must pass clean. Manual: open the file navigator's search pop-up, type a query with a ghost completion, verify the typed text and ghost text line up exactly (same left edge, same baseline).
