# Use an icon for image Edit

**Complexity: 2/10** — this is one metadata control, with a plugin-local Font Awesome glyph, accessible labeling, focused client assertions, and a small image-tab spec update.

## Goal

Viewer mode's image-tab metadata row must show a recognizable edit icon instead of the word “Edit.” The icon-only button must retain an explicit accessible name and tooltip, and must still switch the same tab into editor mode.

## Approach

Render Font Awesome's solid pen glyph inside the existing button, give it a semantic image-edit class that shares the neighboring icon controls' transparent styling, and label it `Edit image` through both `aria-label` and `title`. Import the glyph directly from Font Awesome because concrete client plugins may depend on external packages and their own files, but cannot import the host's central icon registry across the plugin boundary.

Save and Done remain text controls in editor mode; only the viewer's Edit affordance changes.

## Implementation steps

1. Update `web/src/plugins/image/ImageTab.tsx` to render the icon-only Edit image button with its accessible label, tooltip, and semantic class; extend the existing transparent icon-button rule in `web/src/theme.css` to style that class. Update `web/src/plugins/image/ImageTab.test.tsx` to assert an SVG icon with no text label, preserve accessible activation coverage, and use the new accessible name in mode-switch tests; update the mode-transition assertion in `web/src/plugins/image/ImageEditor.test.tsx` to use that same accessible name. Run `./scripts/run.mjs check-diff`.
2. Update `product/specs/image-tab.md` so viewer-mode layout and editing transitions describe the pen-shaped, icon-only **Edit image** control rather than a text Edit button. Confirm the public image-viewer page does not document image editing, so it needs no wording change. Run `./scripts/run.mjs check-diff`.
3. Promote this plan to complete and remove only the matching fixed entry from `product/backlog/issues.md`. Run `./scripts/run.mjs check-diff`.

## Tests

- `web/src/plugins/image/ImageTab.test.tsx`: viewer mode exposes a button named `Edit image`, with a matching tooltip, an SVG glyph, and no text content.
- `web/src/plugins/image/ImageTab.test.tsx`: activating the icon enters editor mode; Done returns to a viewer that exposes the icon again.
- Existing image viewer, editor, split-action, source-sharing, and server-driven mode tests continue to pass.

## Out of scope

- Replacing the editor-mode Save or Done labels with icons.
- Changing the image editor's operations or mode-transition behavior.
- Adding image-editing content to the public viewer guide, which currently documents only viewing, zooming, panning, and lifecycle.

## Verification

`./scripts/run.mjs check-diff` must pass cleanly after each implementation step.
