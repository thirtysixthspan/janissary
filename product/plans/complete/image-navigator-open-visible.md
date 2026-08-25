# Show navigator-opened images

**Complexity: 3/10** — the navigator and command-bar routes already converge on the same image payload, so the correction is confined to how viewer and editor modes share the decoded source, plus focused client tests and the image-tab specification.

## Goal

Opening an image from the file navigator must show that image in the viewer exactly as opening it from a command bar does. Viewer mode must request and render one image element while retaining a usable pixel source for later editing and host-triggered saves.

## Approach

Make the visible viewer image the editor's source while the tab is in viewer mode. Pass the editor source ref and load callback into `ImageViewer`, where the existing orientation load handler can also record intrinsic dimensions. Mount the hidden source only while the editor body is active, when there is no visible image to supply pixels.

This removes the PR's only rendering-path difference from the original viewer — a second hidden request placed before the visible image — without changing file-navigator dispatch, authenticated resource URLs, zoom, pan, orientation, or edit persistence.

## Implementation steps

1. Extend `web/src/plugins/image/ImageViewer.tsx` to accept the editor source ref and load callback, attach the ref to its visible image, and report intrinsic dimensions from the same load event that determines orientation. Run `./scripts/run.mjs check-diff`.
2. Update `web/src/plugins/image/ImageTab.tsx` to mount `.image-edit-source` only in editor mode and pass source ownership to `ImageViewer` in viewer mode. Update `web/src/plugins/image/ImageTab.test.tsx` to prove viewer mode contains exactly one visible image, that its load initializes the editor source, and that editor mode still mounts the hidden source needed for canvas replay and host saves. Run `./scripts/run.mjs check-diff`.
3. Update `product/specs/image-tab.md` to state that every entry route renders the opened image through one authenticated viewer resource and that the same decoded image becomes the editing source. Confirm the existing public image-viewer documentation already describes the user-visible outcome and needs no wording change. Run `./scripts/run.mjs check-diff`.
4. Promote this plan to complete and remove only the matching fixed entry from `product/backlog/issues.md`. Run `./scripts/run.mjs check-diff`.

## Tests

- `web/src/plugins/image/ImageTab.test.tsx`: viewer mode has one image element, it is the visible stage image, and it uses the host-authenticated resource URL.
- `web/src/plugins/image/ImageTab.test.tsx`: loading the viewer image records its intrinsic dimensions so entering edit mode produces the correctly sized editing source/canvas path.
- `web/src/plugins/image/ImageTab.test.tsx`: editor mode mounts one hidden source image and returning to viewer mode restores one visible source image without keeping a duplicate.

## Out of scope

- Changing file-navigator opener resolution or command dispatch, which already sends the same `open <absolute-path>` command as the working route.
- Changing image zoom, pan, orientation, editing operations, save naming, or unsaved-change guards.
- Adding new public documentation for image editing; the current public page already promises that opening an image shows it and does not document source-element internals.
- The separate PR 789 follow-ups for a file-navigator Edit menu entry and an icon-only metadata Edit control.

## Verification

`./scripts/run.mjs check-diff` must pass cleanly after each implementation step.
