# Make the launcher's status dot something you can see

**Complexity: 2/10** — one glyph where an empty span was, one rule given a size, and an assertion that fails on an unpainted span.

`.launcher-dot` in `web/src/plugins/launcher/LauncherTabRowView.tsx` renders an empty `<span>` whose class carries the tab's colour and the busy animation. `launcher.css` gives it `flex`, a `font-size`, and a `line-height`, and nothing else: no content, no dimensions, no background, no pseudo-element. So there is nothing to colour, nothing to blink, and nothing to draw — the promised busy indicator is invisible. The row's own colour attribute is right, which is why the existing test could see a correct colour on an element that paints nothing.

The rest of the application draws this exact dot in `TabItem.tsx`, `CommandBarShell.tsx`, and `TabNavPicker.tsx`: the same span, the same colour, and a FontAwesome circle inside it.

## Goal

Every launcher tab row draws the same visible dot the rest of the application's tab chrome draws, coloured by the tab and blinking while it is busy.

## Approach

1. **`LauncherTabRowView.tsx`** puts the application's own status-dot glyph inside the span, exactly as `TabItem.tsx` does — the same icon, the same colour carried on the same element, so a launcher row matches its tab in the strip.
2. **`launcher.css`** gives `.launcher-dot` a painted size, so the shape has dimensions of its own rather than relying on the glyph's `1em`. The busy animation is untouched.
3. The row's colour test stays, and a second assertion fails if the dot ever goes back to being an empty span: the glyph is inside it, and the stylesheet gives the element a size.

### Rejected alternatives

- A CSS `background: currentColor` circle with no glyph. It works, and it is a second dot in the application that agrees with nothing else; the glyph is one import and the shape already exists.
- Leaving the styling alone and only adding a background to `.launcher-dot`. The busy animation would then blink a block rather than the tab's own dot.

## Implementation steps

1. Put the status-dot glyph in the row's dot span.
2. Give `.launcher-dot` a painted size in `launcher.css`.
3. Extend the row's dot test and run `./scripts/run.mjs check-diff`.

## Tests

- `web/src/plugins/launcher/LauncherTab.test.tsx`: the row's dot carries the tab's colour *and* the glyph the rest of the application draws, and the stylesheet gives the dot a size — so an empty span, which is what the colour-only test could not see, fails.

## Spec updates

- `product/specs/launcher.md`: the row's dot is the tab's own, drawn as the tab strip draws it and blinking while the tab is busy.

## Out of scope

- The unread flag, the tier labels, and the row's other chrome, which are all drawn already.
- A different dot per tier. The colour is the tab's, not the tier's.
