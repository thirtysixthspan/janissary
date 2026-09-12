# Rename the shared plugin header size class to `plugin-size`

**Complexity: 2/10** — a class rename across four single-line JSX sites, one new CSS rule, and the tests that pin them.

## Goal

The image, video, audio, and markdown tab headers each mark the file size with `<span className="image-size">`, the image plugin's class. Three of those plugins have nothing to do with images, and the class carries no rules anywhere in `web/src`, so it is a borrowed name with no styling behind it: a reader looking for where a markdown tab's size is styled is sent to the image plugin and finds nothing. The PDF plugin already renders `plugin-size`, matching the `plugin-name` and `plugin-loc` that the same shared header uses, which leaves the other four inconsistent with it.

Bring all five onto `plugin-size`, and give the class the styling that justifies its existence in `web/src/plugins/shared.css`, alongside `.plugin-name` and `.plugin-loc`.

## Approach

`plugin-size` becomes the one name the shared plugin header uses for the file size, and `shared.css` gains a rule for it rather than leaving a fifth bare name in the markup. The rule is `white-space: nowrap`, which keeps a size token — `2.1 KB`, `4.7 MB` — from wrapping between its number and its unit when the metadata row runs out of width. That is the only styling the size needs of its own; the colour, spacing, and selectability all come from the `.plugin-meta` container it sits in.

The alternative the backlog entry offers — dropping the class from all five headers — is rejected: the header's other two spans are named, the size would be the lone unnamed one, and the wrap behaviour above is worth stating somewhere.

## Implementation steps

1. **`web/src/plugins/shared.css`** — add `.plugin-meta .plugin-size { white-space: nowrap; }` next to the existing `.plugin-name` and `.plugin-loc` rules.
2. **`web/src/plugins/image/ImageTab.tsx`** — `image-size` becomes `plugin-size`.
3. **`web/src/plugins/video/VideoTab.tsx`** — same.
4. **`web/src/plugins/audio/AudioTab.tsx`** — same.
5. **`web/src/plugins/markdown/MarkdownTab.tsx`** — same.

After the last one, `image-size` appears nowhere under `web/src`.

## Tests

- `web/src/plugins/image/ImageTab.test.tsx`, `video/VideoTab.test.tsx`, `audio/AudioTab.test.tsx`, `markdown/MarkdownTab.test.tsx` — each gains an assertion that the rendered size text sits in a `.plugin-size` element and that the tab renders no `.image-size` element.
- `web/src/theme.test.ts` — the plugin-metadata test extends to assert that `shared.css` carries a `.plugin-size` rule holding `white-space: nowrap`, and that the application stylesheet does not carry the selector.

## Out of scope

- The host's own metadata headers (editor, file navigator, monitor), which use the `theme.css` classes rather than the shared plugin ones. This change is confined to the plugin headers that load `shared.css`.
- Any other borrowing between plugins, and any further styling of the metadata row.
