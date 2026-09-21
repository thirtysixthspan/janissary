# Compose the file-backed tab payload once in the plugin host's shared file helpers

**Complexity: 2/10** — one new small helper function in an existing module, and four call sites
each reduced to a spread. No design decisions, no new types, no behavior change.

`src/plugins/files.ts` holds the operations every file-backed tab plugin performs, composed once from
the capability primitives the contract already supplies (`fileSize`, `openFileExternally`,
`openFileInConfiguredViewer`, `servesContentType`). The one operation it does not hold — the
name/path/size/url record every file-backed tab payload starts from — appears verbatim in four
plugins' activations: `activate` in `src/plugins/markdown/activate.ts`, `openPdfTab` in
`src/plugins/pdf/activate.ts`, `activate` in `src/plugins/video/activate.ts` (with one extra `player`
field), and the local `imagePayload` helper in `src/plugins/image/activate.ts`.

## Goal

`fileTabPayload(file, resources)` in `src/plugins/files.ts` returns the four common fields
(`name`, `path`, `size`, `url`); each of the four sites spreads it instead of restating the four
lines. Nothing about what any tab payload contains changes — verified by every existing test for the
four plugins' opened-tab payloads passing unchanged.

## Approach

1. **Add `fileTabPayload(file: string, resources: TabPluginResources)` to `src/plugins/files.ts`**,
   returning `{ name: path.basename(file), path: file, size: fileSize(file), url:
   resources.registerFile(file) }`. Does not move the payload *types* or their guards — per
   `ai/guidelines/plugins-tabs.md`, `src/plugins/<id>/shared.ts` imports nothing at all, not even a
   type, so each plugin keeps declaring and guarding its own shape and schema version; the helper only
   builds the value the server hands to `openOrFocusTab`.
2. **`markdown/activate.ts`**: `payload: { ...fileTabPayload(file, resources) }` (the object spread
   alone is the whole payload for this plugin).
3. **`pdf/activate.ts`**: same, inside `openPdfTab`.
4. **`video/activate.ts`**: `payload: { ...fileTabPayload(file, resources), player:
   capabilities.configuredViewer() }`.
5. **`image/activate.ts`**: `imagePayload` becomes `const payload: ImagePayload = fileTabPayload(file,
   resources); return mode ? { ...payload, mode } : payload;` — the existing
   mode-omitted-not-undefined branch is untouched.
6. **`audio/activate.ts` is deliberately untouched** — it builds a playlist rather than a single file
   record, which is outside what this helper composes.

## Implementation steps

1. `src/plugins/files.ts`: add `fileTabPayload`, importing `TabPluginResources` from `./api.js`.
2. Update the four call sites.
3. Run `check-diff` after each file.

## Tests

- `src/plugins/files.test.ts` — add a case for `fileTabPayload`: given a real temp file and a fake
  `resources.registerFile`, it returns the four fields with the expected values (mirroring
  `fileSize`'s existing temp-file fixture and a simple `registerFile: vi.fn(() => '/resource/url')`).
- `src/plugins/markdown/activate.test.ts`, `src/plugins/pdf/activate.test.ts`,
  `src/plugins/video/activate.test.ts`, and `src/plugins/image/activate.test.ts` — must pass
  unchanged; they pin what each opened tab's payload contains and this change does not alter it.

## Out of scope

- `src/plugins/audio/activate.ts` — builds a playlist, not a single file record.
- Any change to the payload types or guards in each plugin's own `shared.ts`.
- Any change to `TabPluginResources` or the plugin contract in `src/plugins/api.ts`.
