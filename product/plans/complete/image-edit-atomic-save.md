# Write Image Edits Atomically Over the Original

**Complexity: 3/10** — the change adds a byte-writing wrapper to the file helper already admitted by the plugin boundary, routes image saves through it, corrects two stale comments, and updates the existing behavior descriptions.

## Goal

Keep the original image intact if saving edited pixels fails, while continuing to write the PNG over the same source path.

## Approach

`src/atomic-write.ts` already accepts `Uint8Array`, and `src/plugins/files.ts` is admitted to concrete plugins and wraps that writer for text config files. Add a byte-content helper there and use it from `saveImageEdit` after the existing PNG data-URL validation. The image keeps its original path and basename; no plugin capability or import boundary changes.

Update the comments in `src/openers/numbered-sibling.ts` and `eslint.plugin-boundaries.mjs` to name the video plugin as the only consumer of the numbered-sibling writer. Keep the generic helper and video behavior intact.

## Implementation steps

1. Add `replaceFileAtomically(filePath, content: Uint8Array)` to `src/plugins/files.ts`, implemented through `atomicWriteFile`.
2. Route decoded image PNG bytes in `src/plugins/image/edit.ts` through that helper, retaining the PNG data-URL check and returned basename.
3. Correct the two comments that still claim the image plugin uses the numbered-sibling writer.
4. Add a `src/plugins/files.test.ts` regression that forces the atomic replacement to fail and verifies the target's previous bytes remain and the temporary file is cleaned up. Keep the existing image edit and intent tests passing.
5. Update `product/specs/image-tab.md` with the failed-save behavior, correct the stale numbered-file descriptions in `product/specs/editor-tab.md` and `product/specs/quit-confirmation.md`, and update the existing save description in `documentation/user-documentation/tab-types/image-viewer.md` to explain that a failed save leaves the original unchanged.
6. Run `$janissary/scripts/run.mjs check-diff` after each implementation, test, and documentation step.

## Tests

- In `src/plugins/files.test.ts`, fail the final atomic replacement of an existing file and verify its old bytes remain and no temporary sibling is left behind.
- Keep `src/plugins/image/edit.test.ts` coverage for replacing the source, leaving no sibling, rejecting non-PNG data URLs, and surfacing write failures.
- Keep `src/plugins/image/activate.test.ts` coverage for the save intent and updated file size.

## Out of scope

- Detecting external edits made after the image was opened. The current image-save contract does not perform the text editor's hash check.
- Changing image output format, destination, name, plugin API, or the video plugin's numbered frame captures.
