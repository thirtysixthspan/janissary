# Start image-editor crop selection at the full image

**Complexity: 1/10** — Crop mode already owns its rectangle in `ImageEditor` and knows the rendered image dimensions. Initializing that state to the full current bounds is a localized UI-state change with one regression test and one specification correction.

## Goal

When a user chooses **Crop**, show a crop selection that starts at the entire image rather than requiring an initial drag.

## Approach

Initialize the crop rectangle to `{ x: 0, y: 0, width, height }` from the editor's current output dimensions when Crop mode opens. Existing overlay drag behavior replaces that rectangle, and existing edge/corner handles continue to adjust it.

## Implementation steps

1. Update `web/src/plugins/image/ImageEditor.tsx` so entering Crop initializes its rectangle to the current image bounds.
2. Add an `ImageEditor` test that opens Crop and verifies the full-image readout and selection geometry.
3. Update the image-tab functional specification's Crop behavior.

## Tests

- `web/src/plugins/image/ImageEditor.test.tsx` verifies Crop initially selects the complete current image and remains ready to apply.

Run `./scripts/run.mjs check-diff` after each implementation step.

## Spec updates

- `product/specs/image-tab.md` — document the full-image default selection.

## Docs

`help.md` and `documentation/user-documentation/` do not describe crop-selection defaults, so no public-documentation update is needed.

## Out of scope

- Changing crop dragging, handles, constraints, or output geometry.
- Changing any image-editor save behavior.
