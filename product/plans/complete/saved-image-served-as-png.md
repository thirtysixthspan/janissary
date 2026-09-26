# Serve an image saved from the editor as the PNG it now holds

**Complexity: 3/10** — one small server module that reads a file's first eight bytes, one call to it in the `/open/` route, and one `updateTab` after the image plugin's save. No client, wire, or plugin-contract change.

## Root cause

`saveImageEdit` (`src/plugins/image/edit.ts`) writes the editor's PNG over the tab's original path whatever that path's extension is, as the spec requires. The `/open/<id>` route in `src/serve-static.ts` then labels every served file by its extension alone, through the `MIME` map that `pluginContentTypes` feeds. So a `vector.svg` that now holds PNG bytes is answered as `image/svg+xml`. Browsers tolerate a wrong raster label by sniffing, but SVG is an XML type and a mismatch is a hard refusal, so the `<img>` never decodes and the one file the app itself wrote is the one it cannot display. Updating the registration after a save would not help: a later app instance registers the file afresh and knows nothing of the save, so the type has to come from the bytes being served.

The stale header size is a second, smaller gap in the same save: the payload's `size` is read once when the tab opens, and the `save-edit` intent never restates it.

## Correct behavior

A registered image file whose bytes are a PNG is served as `image/png`, whatever its extension, so an image saved from the editor opens again in any app instance; every other file keeps the extension-derived type. After a successful save the tab's header shows the size of the file just written.

## Reproduction

Failing tests written before the fix, run with `npx vitest run --project server src/index.test.ts src/plugins/image/activate.test.ts`:

- `the static file server > serves an SVG the image editor saved over as the PNG it now holds` writes a real SVG to `vector.svg` (served as `image/svg+xml`), saves a PNG over it with `saveImageEdit`, and serves it again: `expected 'image/svg+xml' to be 'image/png'`.
- `image plugin intents > restates the written file size on the tab it saved, keeping the rest of the payload` runs `save-edit` against a 283-byte `vector.svg` with a 3940-byte PNG: `expected [] to deeply equal [ { key, payload: { …, size: '3.8 KB' } } ]` — no tab update happens.

The bug report's browser observation (a 1252×16 broken image with `naturalWidth: 0`, and the same bytes displaying correctly as `renamed.png`) follows directly from the first: the response type is the only difference between the two requests.

## Approach

Add `servedContentType(filePath, extensionType)` in a new `src/open/content-type.ts`. When the extension-derived type is an `image/*` type other than `image/png`, it reads the file's first eight bytes and answers `image/png` if they are the PNG signature; otherwise, and on any read error, it answers the extension-derived type unchanged. The `/open/` branch of `staticFileServer` awaits it in place of the bare map lookup. Only images are sniffed and only toward PNG, so the check can never relabel a non-image file or promote bytes to a scriptable type such as SVG or HTML. PNG is the one format the app writes under a foreign extension, so it is the one signature recognised.

In the image plugin's `save-edit` intent, after the write succeeds, call `capabilities.updateTab(tabPayload.path, …)` with the current tab payload and a fresh `fileSize(tabPayload.path)`. The instance key is the file path, the url and mode carry over untouched, and the client re-renders the header without remounting the editor. `updateTab` is already a declared capability.

## Implementation steps

1. Create `src/open/content-type.ts` exporting `servedContentType`, reading the leading bytes with a `node:fs/promises` file handle that is always closed. Give it a comment explaining why it sniffs at all (the editor writes PNG under the original extension, and an SVG label is a hard refusal) and why only images and only toward PNG.
2. In `src/serve-static.ts`, compute the `/open/` response's `content-type` with `await servedContentType(filePath, extensionType)`.
3. In `src/plugins/image/activate.ts`, restate the tab's size through `updateTab` after `saveImageEdit` returns, importing `fileSize` from `../files.js`.

## Regression tests

`src/index.test.ts`, in `the static file server`:

- `serves an SVG the image editor saved over as the PNG it now holds` — the reported scenario end to end on the server: before the save the real SVG is `image/svg+xml`, after `saveImageEdit` the same reference answers `image/png`.
- `keeps the extension-derived type for a file that is not an image, whatever its bytes` — PNG bytes in `notes.txt` are still `text/plain; charset=utf-8`.

`src/open/content-type.test.ts` (new) covers `servedContentType` on its own: PNG bytes under an SVG or JPEG type answer `image/png`; real SVG bytes, a file shorter than the signature, a non-image type, and an unreadable path all keep the extension type.

`src/plugins/image/activate.test.ts`, in `image plugin intents`:

- `restates the written file size on the tab it saved, keeping the rest of the payload` — one `updateTab` keyed on the path, with the same payload (mode included) and the written file's size.

## Verification

Against a separate instance started with `node bin/janus.mjs --no-open <scratch-dir>` and driven through the attached browser: `edit vector.svg` on a 300×150 SVG, **Rotate right**, **Save** — the header reads `Saved vector.svg`, its size moves from `248 B` to `3.5 KB`, and the file on disk begins with the PNG signature. In a second, fresh instance, `open vector.svg` fetches the reference once, answered `200` with `image/png`, and the stage shows a decoded 150×300 image.

## Spec updates

`product/specs/image-tab.md` — under "Serving the image", say that an image whose bytes are a PNG is served as a PNG whatever its extension; under "Saving an edit", say that a saved file opens again as the PNG it now is, even under its original `.svg` name, and that the header's size follows the save.

## Docs

None. `documentation/user-documentation/tab-types/image-viewer.md` already says every save is a PNG and replaces the original; it never claimed the result could not be reopened. `help.md` does not cover image editing.

## Out of scope

- Renaming the saved file to a `.png` extension; the spec keeps the original path and identity.
- Recognising other raster signatures (JPEG, GIF, WebP) under a mismatched extension; the app never writes one, and browsers already sniff raster types.
- Changing the content types served for the web UI's own assets.
