# Move image tab functionality into an image plugin

**Complexity: 6/10** — large but mechanical. The bundled tab-plugin extension point already exists (see `tab-plugin-architecture-parallel.md`) and the video plugin is a working reference implementation, so this is a migration along an established path rather than new architecture. The two places that need real design thought are profile save/launch (image tabs are the only view tab that a profile can save and reopen, and plugin tabs currently cannot be) and the client-side notion of "this tab is active", which the image body needs for its keyboard controls and which plugin bodies are not told today.

## Goal

`open <image>` opens an image tab through a bundled `image` tab plugin instead of through the core opener registry and a core `image` tab view. Everything the user sees stays the same: the same claimed extensions, the same external-viewer behavior, the same metadata header, the same zoom/pan/reset controls, the same tab-strip name and close button, and the same profile save/launch support. Core stops carrying an image-shaped tab payload, an image opener, an image tab creator, and an image branch in the client view router.

## Approach

1. **Server plugin.** A new `src/plugins/image/` (manifest, import-free shared contract, activation) claims the nine image extensions and their MIME types, opens/focuses a tab keyed by absolute path, and hands the file to the OS viewer for the external presentation. No declared command (the image opener never had one) and no intents — the activation's required `intent` handler rejects every request, which is what "this plugin answers no intents" looks like under the v1 contract.

2. **Client plugin.** `web/src/plugins/image/` holds the lazily-imported entry, the component, and the key handlers, moved out of `web/src/`. The component takes `{ payload, capabilities }` and uses `capabilities.resourceUrl` for the image source and `capabilities.splitAction` for the split control.

3. **One additive client capability: `active`.** Plugin tab bodies stay mounted while hidden (that is what preserves video playback across tab switches), so the image body — which listens for zoom/pan keys on the window and which resets zoom and pan when the user switches to it — must know whether its tab is the visible one. The host already knows: `PluginTabLayer` computes it for the border. Adding a fifth field to `TabPluginClientCapabilities` is an additive change and keeps `TAB_PLUGIN_API_VERSION` at 1 (see `ai/guidelines/plugins-tabs.md`, "Import boundaries and versioning"). The alternative — having the plugin sniff the host's `.tab-body` element for `display: none` — would put host DOM structure inside a plugin and is rejected.

4. **Profile support becomes generic rather than image-shaped.** Today `profile save` writes `{"type": "image", "path": …}` and `profile launch` matches the reopened tab by `tab.image.path`; neither survives the migration, and hard-coding the id `image` into core profile code would be exactly the conditional the plugin guidelines forbid. Instead a profile gains a `plugin` tab entry carrying `id` and `path`: save writes one for every plugin tab (so video tabs, previously skipped, are saved too), and launch reopens it with `open <path>` and matches by the plugin id plus the tab's instance key. A `type: "image"` entry in an existing profile still loads — the loader maps it to a `plugin` entry with id `image`, a compatibility shim so no saved profile breaks.

5. **Profile launch becomes async.** A plugin opener resolves through activation, so the tab does not exist when `managers.openFile.run(...)` returns. `openProfileViewTabs` and `openProfileEntries` become async and await each open before the placement, reorder, and focus passes that follow; `ProfileManager.run` fires the launch without awaiting it, as it already does for `profile save`.

## Implementation steps

### 1 — Server plugin

- `src/plugins/image/shared.ts`: `IMAGE_PAYLOAD_SCHEMA_VERSION = 1`, `ImagePayload` (`name`, `path`, `size`, `url`), `isImagePayload`. Import-free, hand-written guard, mirroring `src/plugins/video/shared.ts`.
- `src/plugins/image/manifest.ts`: id `image`, version `1.0.0`, `apiVersion` from the host constant, `payloadSchemaVersion` from the shared constant, `tabLabelPrefix: 'image'`, `fileExtensions` mapping `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`, `.svg`, `.avif`, `.ico` to the MIME types `src/index.ts` serves today. No `editGesture` (a `.png` row's shift activation keeps opening the text editor, as now) and no `command`. Capabilities: `note`, `openOrFocusTab`, `openExternally`, `rejectRequest`, `reportFailure` — not `configuredViewer`, since the image opener has never consulted `externalViewers`.
- `src/plugins/image/activate.ts`: `opener.inline` calls `openOrFocusTab(file, …)` producing `{ title: basename, payload: { name, path, size, url: registerFile(file) } }` with `humanSize(statSync(file).size)` and the same `'unknown'` fallback the current opener uses; `opener.external` reproduces the two existing notes verbatim (`Opening <name> in your image viewer…` / `No image viewer available. The file is at <path>`); `intent` validates the authoritative tab payload (`reportFailure` when it is not one of ours, matching video) and otherwise rejects with `unknown image intent "<name>"`; `isPayload` is the shared guard.
- Register in `src/plugins/catalog.ts` and `src/plugins/loaders.ts`.

### 2 — Remove the core image opener

- Delete `src/openers/image.ts` and `src/openers/image.test.ts`; drop the entry from `src/openers/index.ts`.
- Drop `openImageTab` from `OpenContext` (`src/openers/types.ts`) and from `OpenFileManager.buildContext`.
- In `src/index.ts`, drop the `/open/`-route image MIME lines now supplied by the manifest. `.svg` and `.ico` keep their core entries: that map also types the web UI's own bundled assets, and core precedence over plugin claims has to hold uniformly.

### 3 — Remove the core image tab

- `src/tab/types.ts`: delete `ImageView`, `Tab.image`, and `'image'` from the view union; update the neighboring comments that use the image tab as their example.
- `src/tab/index.ts` (`makeImageTab`), `src/tab/creators.ts` (`addImageTab`), `src/tab/unique-labels.ts` (`uniqueImageLabel`), `src/tab/openers.ts` (`openImageTab`), `src/tab/opening-state.ts` (`openImageTab`), `src/tab/cleanup.ts` (the `tab.image` file-reference release — plugin tabs already release through `fileRefs`), `src/tab/view.ts` (the `image` field on the wire view).
- `src/protocol.ts`: drop the `ImageView` re-export, the `image` field, and `'image'` from the view union.

### 4 — Client plugin

- Move `web/src/ImageTab.tsx` → `web/src/plugins/image/ImageTab.tsx` and `web/src/image-handlers.ts` → `web/src/plugins/image/image-handlers.ts`; add `web/src/plugins/image/index.tsx` default-exporting the component and named-exporting `isPayload` from `@shared/plugins/image/shared`.
- The component takes `{ payload, capabilities }`: the source becomes `capabilities.resourceUrl(payload.url)` instead of reading the token from the query string, and the header's split control becomes `capabilities.splitAction` instead of the `onSplit` prop. Keyboard listeners bind only while `capabilities.active`, and zoom and pan reset when the tab becomes active again, preserving "switching to a different image tab resets zoom and pan".
- `web/src/plugins/registry.tsx`: add the `image` loader and registration with its schema-version literal.
- `web/src/ViewTabBody.tsx`: drop the image branch; `web/src/TabItem.tsx`: drop `tab.image?.name` from the rename prefill chain (a plugin tab's `title` already carries the file name); `web/src/useViewSearchState.ts`: add `plugin` to the view-tab kinds so an image (and video) tab is still treated as a non-searchable view tab.
- Delete `web/src/ImageTab.test.tsx` after porting its cases.

### 5 — The `active` client capability

- `web/src/plugins/api.ts`: add `active: boolean` to `TabPluginClientCapabilities` and to `createPluginClientCapabilities`.
- `web/src/plugins/PluginBody.tsx`: accept `active` and include it in the memoized capability object.
- `web/src/plugins/PluginTabLayer.tsx`: pass `tab.label === current.label`.
- Update the two documents that state the client capability count and list: `documentation/developer-documentation/tab-plugins.md` and `ai/guidelines/plugins-tabs.md`. Both currently say the client surface exposes exactly four things; leaving them saying that would make the contract documentation false, which the plugin guidelines treat as a bug.

### 6 — Profiles

- `src/profile/types.ts`: add `ProfilePluginTabFile` (`type: 'plugin'`, `id`, `path`) to the on-disk union, keep `ProfileImageTabFile` as the legacy input shape, and replace the `image` member of `ProfileViewEntry` with `{ type: 'plugin'; id: string; path: string }`.
- `src/profile/schema.ts`: add `plugin` to the recognized tab types and to the presentation-carrying types; a `plugin` entry requires string `id` and `path`.
- `src/profile/file.ts`: partition a `plugin` entry into `views`; map a legacy `image` entry to `{ type: 'plugin', id: 'image', path }`.
- `src/profile/view-tabs.ts`: a `plugin` target runs `open <path>` and matches `tab.plugin?.id === id && tab.plugin.instanceKey === file`, with `preClose: false` (the host focuses an existing plugin tab with the same instance key, exactly as `openImageTab` reused one in place). The launch notes keep naming the plugin (`Opened image tab.`) rather than the generic word, so existing messages do not change.
- `src/profile/save-entries.ts`: replace `writeImageEntry` with `writePluginEntry`, writing `{ type: 'plugin', id, path: portablePath(instanceKey) }`.
- `src/profile/save-route.ts` and `src/profile/save.ts`: route `view: 'plugin'` tabs through the new writer, rename the `images` counter to `plugins`, and report `N plugin tabs`.
- `src/profile/view-tabs.ts`, `src/profile/agent-opener.ts`, `src/profile/manager.ts`: make view-tab opening and `openProfileEntries` async as described above.

## Tests

Server (`src/plugins/image/activate.test.ts`, modeled on `src/plugins/video/activate.test.ts`):

- `open <image>` inline produces a tab whose payload carries name, path, human-readable size, and the registered url, and titles the tab with the file's basename.
- A second inline open of the same path focuses the existing tab instead of registering a second file reference.
- `open external <image>` notes the viewer line when the OS open succeeds and the fallback path line when it does not.
- An unknown intent is rejected without disabling the plugin; an intent arriving with a tab payload that is not an image payload reports a failure.
- `isImagePayload` accepts a complete payload and rejects `null`, an array, and each missing field.
- The size lookup falling back to `unknown` when the file disappears between dispatch and payload construction.

Profiles:

- `src/profile/save.test.ts`: an open image tab saves as a `plugin` entry carrying id `image` and a `$root`-relative path; the summary reports the plugin-tab count.
- `src/profile/view-tabs.test.ts`: a `plugin` entry opens its tab, places it in its authored group, and reuses an already-open tab with the same path; a legacy `type: "image"` entry does the same; an entry whose file does not exist is reported and skipped.
- `src/profile/validate.test.ts`: a `plugin` entry missing `id` is reported, and the type list in the message includes `plugin`.
- `src/profile/file.test.ts`: a legacy `image` entry loads as a `plugin` view entry.

Client (`web/src/plugins/image/ImageTab.test.tsx`, ported from the existing suite):

- Renders name, size, and location, and the image with the capability-provided source.
- Renders the host's split action when one is supplied and nothing when it is not.
- Zoom in/out/reset by key and wheel, the clamped bounds, the zoom badge's presence and absence, and orientation classes from the loaded image's natural dimensions.
- Arrow-key panning and click-drag panning move the stage.
- Keys are ignored while the tab is inactive, and zoom and pan reset when it becomes active again.
- `web/src/plugins/registry.test.tsx`: the image registration's schema-version literal matches the plugin's own constant.
- `web/src/plugins/PluginTabLayer.test.tsx`: the capability object reports `active` for the current tab and not for a hidden one.

## Out of scope

- Any change to how the image view looks or behaves for the user beyond what the migration forces.
- An `image <path>` command. The video plugin declares one because `video` was a new user-facing route; `open` has always been the only way to open an image.
- Frame-capture-style intents for images. The plugin declares none.
- Extending profile support beyond parity — no new keys for zoom, pan, or per-plugin payload state.
- Changes to the video plugin other than receiving the new `active` capability.
- Persisting image tabs to agent state or restoring them on `--relaunch`; they remain live, in-memory views.
