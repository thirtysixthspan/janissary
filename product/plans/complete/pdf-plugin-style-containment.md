# Contain the PDF plugin's styling to its own tab

**Complexity: 4/10**

## Goal

Opening a PDF tab currently restyles the application around it. The file navigator and the notifications feed in a sidebar gain a white background, a border, a drop shadow, rounded corners, and a fixed width the moment a PDF is opened, and they keep them for the rest of the session. Nothing about the PDF view should be visible anywhere but the PDF view.

## Why it happens

`web/src/plugins/pdf/index.tsx` imports `pdfjs-dist/web/pdf_viewer.css`. That file is not a text-layer stylesheet: it is the whole stylesheet for Firefox's PDF viewer application, 6,400 lines of it, and its rules are written for that application's own markup at the top level of the document. Among them:

- `.sidebar { background-color: light-dark(#fff, …); border: …; box-shadow: …; border-radius: 8px; width: 239px; position: relative; … }` — and `web/src/theme.css` names the host's sidebars `.sidebar`. This is the reported white background.
- `.dialog`, `.hidden`, `.treeView`, `.messageBar`, `.toggle-button`, `.popupMenu`, `.spread`, `.page`, `.primaryButton`, `.secondaryButton`, `#outerContainer`, and a bare `[data-main-rotation="…"]` attribute selector — every one of them a name the host or a future host component could plausibly use.
- Two `:root` blocks setting `color-scheme` and a large set of viewer-wide custom properties.

The existing plan (`product/plans/complete/pdf-viewer-plugin.md`) took this import knowingly and countered the one rule it had noticed, with `:root { color-scheme: normal; }` in `pdf.css`, on the reasoning that the `:root` block "is also the whole of what leaks". That reasoning was wrong: `.sidebar` alone disproves it, and a counter-rule per collision is not a strategy — it can only ever chase collisions that have already been noticed, and it grows a new one every time `pdfjs-dist` is upgraded.

## Approach

Stop loading the viewer application's stylesheet at all, and load instead a stylesheet this plugin owns, every selector of which is rooted in a `pdf-` prefixed class.

The plugin uses exactly one thing from that stylesheet: the geometry of the text layer. `pdf-document.ts` renders a canvas and hands PDF.js a container to build the selectable text into; it uses no annotation layer, no editor, no outline, no toolbar, and no viewer chrome. PDF.js does not require the container to carry any particular class — `TextLayer` sets `--min-font-size` and the layer's dimensions on whatever element it is given, and only the highlight-editor machinery this plugin never constructs looks for `.textLayer` by name. So the container can be named `pdf-text-layer`, and the rules for it and for the spans PDF.js builds inside it can live in the plugin, scoped under that class.

That leaves the PDF tab contributing no unprefixed class name to the document, which is the property worth testing for.

A second, smaller borrowing goes with it: `PdfTab.tsx` marks the file size with `className="image-size"`, the image tab's class. It carries no rules anywhere in the app, so nothing changes visually, but a PDF tab should not be reaching into another plugin's vocabulary for a name. It becomes `plugin-size`, matching the `plugin-name` and `plugin-loc` the same header already uses. The four other plugins that copied `image-size` are left alone — they are not this fix.

## Implementation steps

1. **Add `web/src/plugins/pdf/pdf-text-layer.css`.** The text layer's rules, derived from the corresponding block of `pdfjs-dist`'s viewer stylesheet, with every selector rooted at `.pdf-text-layer` and written flat rather than nested. It carries:
   - the layer box (`position: absolute; inset: 0; overflow: clip;` and the typography resets that keep PDF.js's per-span metrics honest), plus `--scale-round-x` / `--scale-round-y`, which PDF.js's inline `round(down, …)` sizing reads and which the viewer stylesheet only ever defined on its own `.pdfViewer .page`;
   - the `data-main-rotation` transforms, so a page carrying a `/Rotate` still lands square — the viewer stylesheet declared these as bare attribute selectors, which is itself one of the leaks;
   - the span, `br`, and `.markedContent` rules that position and scale the transparent glyphs;
   - `.endOfContent`, which is how a drag past the last line still selects to the end of the page;
   - the selection colour: this plugin's own blue, and `color: transparent` so a selected glyph stays invisible over the page it is drawn on.

   Rules the plugin has no use for — the highlight editor, the editor toolbar, the annotation and XFA layers, the image text layer, forced-colors variants — are not carried across.

2. **`web/src/plugins/pdf/index.tsx`** — drop the `pdfjs-dist/web/pdf_viewer.css` import; add `./pdf-text-layer.css` before `./pdf.css`.

3. **`web/src/plugins/pdf/PdfPage.tsx`** — the text layer element's class becomes `pdf-text-layer`.

4. **`web/src/plugins/pdf/pdf.css`** — delete the `:root { color-scheme: normal; }` counter-rule, which has nothing left to counter, and the `.pdf-page .textLayer ::selection` rule, whose colour moves to the new file. Update the file's header comment, which currently tells the reader the text layer's geometry comes from the dependency.

5. **`web/src/plugins/pdf/PdfTab.tsx`** — `image-size` becomes `plugin-size`.

## Tests

In `web/src/plugins/pdf/pdf-styles.test.ts`, beside the scrollbar test already there:

- **Every rule the PDF plugin loads is scoped to the PDF tab.** Parse both `pdf.css` and `pdf-text-layer.css`, and assert that every selector in every rule — each comma-separated part of it — begins with a `.pdf-` class. This is the test that fails for `.sidebar`, for `:root`, and for a bare `[data-main-rotation]`, and it is the one that keeps failing if a future change reaches outside the tab again.
- **A host sidebar is untouched by the PDF plugin's styles.** Load both stylesheets, render an element with the host's own `sidebar` class, and assert it has no background colour, border, or box shadow — the symptom as reported, stated directly.
- **The viewer application's stylesheet is not imported.** Read the plugin entry's source and assert it pulls in no `pdfjs-dist` stylesheet. The previous plan argued for that import in writing; the guard states why it is gone.
- **The text layer is rendered under the plugin's own class.** Extend the existing `PdfTab` render test to assert the container PDF.js is handed carries `pdf-text-layer` and that no `.textLayer` element exists.

## Out of scope

- The four other plugins that use `image-size` for the file size. Renaming a class shared across five plugin headers is a separate tidy-up, and touching them here would put four files into this diff for no behavioural reason.
- Any change to what the PDF tab looks like. Nothing in this fix is a visual decision: the page, the strip, the header, the stage, and the selection colour all render exactly as they did.
- Auditing the rest of the plugins for global CSS. The other bundled plugins load only `shared.css` and their own prefixed stylesheet; none of them imports a dependency's stylesheet.
