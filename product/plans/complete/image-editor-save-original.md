# Save image-editor changes to the original file

**Complexity: 2/10** — the existing image edit intent already receives the authoritative source path from the server and validates a PNG data URL. The change is limited to replacing its numbered-sibling destination with that path, adjusting the returned confirmation name, and updating the existing tests and functional specifications.

## Goal

Make **Save** in the image editor replace the original image file instead of creating a sibling named `<base>.edit-<n>.png`.

## Approach

Keep the server authoritative over the save target: `saveImageEdit` will decode only a valid PNG data URL and write those bytes directly to the image path stored in the tab payload. It will return the original basename for the client confirmation. The video frame-capture numbered-sibling helper is unrelated after this change and remains unchanged.

## Implementation steps

1. Update `src/plugins/image/edit.ts` to validate PNG data URLs and overwrite the supplied image path, returning its basename.
2. Update the image save and activation tests to prove the source is replaced, no edited sibling is created, and the returned name is the original filename.
3. Update the image editor confirmation tests to expect the original filename after save.
4. Correct the image-editor behavior in the relevant functional specs.

## Tests

- `src/plugins/image/edit.test.ts` verifies a valid PNG payload replaces the source bytes, returns its basename, creates no sibling, rejects invalid payloads without changing the source, and surfaces write errors.
- `src/plugins/image/activate.test.ts` verifies the save intent returns the original basename selected by the server.
- `web/src/plugins/image/ImageEditor.test.tsx` verifies the Save confirmation uses the original filename.

Run `./scripts/run.mjs check-diff` after each implementation step.

## Spec updates

- `product/specs/image-tab.md` — describe Save as replacing the original image and remove numbered-sibling behavior.
- `product/specs/tab-plugins.md` and `product/specs/open.md` — align the image plugin and `edit` command descriptions with save-in-place behavior.

## Docs

`help.md` and `documentation/user-documentation/` do not describe the image editor's save behavior, so no public-documentation update is needed.

## Out of scope

- Changing video frame captures or their numbered PNG naming.
- Changing image-editor operations, output encoding, or the close/unsaved-work guard.
- The second backlog item about the initial crop selection.
