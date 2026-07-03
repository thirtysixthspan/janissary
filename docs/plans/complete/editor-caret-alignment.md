# Editor caret alignment

**Complexity: 1/10** — CSS-only fix; one property change in `theme.css`.

## Goal

The flashing editor caret (cursor) sits on the text line rather than too low between lines. Currently the caret's `::after` pseudo-element uses `top: -0.1em` which misaligns it with the text.

## Background

The editor caret is rendered as a zero-width `<span className="editor-caret">` with `position: relative` and `display: inline-block`. The visible bar is the `::after` pseudo-element with `position: absolute`, currently:

```css
.editor-caret::after {
    content: ''; position: absolute; left: -1px; top: -0.1em; width: 2px; height: 1.3em;
}
```

The `.editor-caret` inline-block sits at the cursor column in the text flow. The inline-block's top edge is at `baseline - line-height` for a default-vertical-align inline-block. With `top: -0.1em` and `height: 1.3em`, the bar is offset from the line's natural position and can appear between lines rather than on the text.

## Approach

Change `top: -0.1em` to `top: 0` and `height: 1.3em` to `height: 100%`. The caret bar fills the full height of the inline-block (which equals the line height), aligned from the top of the line rather than offset into neighboring lines.

## Implementation steps

1. **Update caret CSS** — in `web/src/theme.css:303`, change `top: -0.1em` to `top: 0` and `height: 1.3em` to `height: 100%`.
2. **Run `./scripts/run.mjs check-diff`**.

## Testing

CSS-only change with no functional impact on tests. Existing tests continue to pass — the caret element is still rendered with the same className and structure; only the visual positioning changes.

## Out of scope

- Changing the caret width, color, or blink animation.
- Multiple-cursor support.

## Verification

`./scripts/run.mjs check-diff` must pass clean. Manual: open an editor tab, verify the caret sits on the text line rather than splitting between lines.
