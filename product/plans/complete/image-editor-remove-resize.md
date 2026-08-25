# Remove image editor resize

**Complexity: 3/10** — resize is a self-contained image operation, but removing it cleanly crosses the editor toolbar, gesture overlay, operation model, canvas renderer, tests, CSS, and the image-tab spec.

## Goal

The image editor must no longer offer or accept a Resize operation. Crop, rotate left, rotate right, flip horizontal, flip vertical, undo, redo, and save must continue to behave as before.

## Approach

Delete resize at the operation-model boundary so no internal caller can append or replay it, then simplify the direct-manipulation UI around the only remaining armed gesture, Crop. The crop overlay keeps its rectangle and eight adjustment handles, while the resize-only origin anchoring, mode class, toolbar control, renderer branch, and tests disappear.

The viewer's responsive fit is unrelated: an image still responds when its tab changes size, and CSS cursor names such as `nwse-resize` still describe crop-handle directions. Those uses remain.

## Implementation steps

1. Remove the resize variant from `ImageOperation` in `web/src/plugins/image/edit-model.ts` and remove the resize canvas path from `web/src/plugins/image/edit-render.ts`. Delete the resize-specific cases from `web/src/plugins/image/edit-model.test.ts` and `web/src/plugins/image/edit-render.test.ts`, preserving coverage for crop, rotate, flip, operation order, minimum canvas size, and PNG flattening. Run `./scripts/run.mjs check-diff`.
2. Remove the Resize control and gesture type from `web/src/plugins/image/ImageEditToolbar.tsx` and `web/src/plugins/image/ImageEditor.tsx`. Simplify `web/src/plugins/image/CropOverlay.tsx` to represent crop only, and remove the resize-only overlay selector from `web/src/theme.css`. Update `web/src/plugins/image/ImageEditor.test.tsx` to cover the five remaining toolbar actions, add a direct assertion that Resize is absent, rename the crop test group, and delete the obsolete resize gesture case. Run `./scripts/run.mjs check-diff`.
3. Update `product/specs/image-tab.md` so its Editing section describes only crop, rotation, and flipping, with Apply and Cancel scoped to crop. Run `./scripts/run.mjs check-diff`.
4. Confirm `help.md` and `documentation/user-documentation/` do not already describe image resize. Promote this plan to complete. Once the branch contains the current backlog, remove only the matching fixed entry from `product/backlog/issues.md`.

## Tests

- `web/src/plugins/image/ImageEditor.test.tsx`: the toolbar offers Crop, Rotate left, Rotate right, Flip horizontal, and Flip vertical; it does not offer Resize; crop still applies and cancels through the direct-manipulation overlay.
- `web/src/plugins/image/edit-model.test.ts`: output dimensions still follow crop, rotation, flipping, and ordered operation replay after resize leaves the operation union.
- `web/src/plugins/image/edit-render.test.ts`: canvas replay still covers crop, rotation, flipping, ordered operations, minimum surface dimensions, and PNG output without a resize branch.

## Out of scope

- Changing how the viewer fits an image when the tab itself is resized.
- Changing crop rectangle adjustment handles or their directional resize cursors.
- The other PR 789 follow-ups concerning file-navigator opening, its context menu, and the Edit control's icon.
- Rewriting the completed image-editor plan, which remains the historical record of the original implementation.
- Adding public documentation for image editing, which is not currently described in `help.md` or the image-viewer page.

## Verification

`./scripts/run.mjs check-diff` must pass cleanly after each implementation step.
