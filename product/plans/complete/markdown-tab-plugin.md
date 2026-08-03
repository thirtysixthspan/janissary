# Move markdown preview tab functionality into a markdown plugin

**Complexity: 5/10** — a migration along an established path. The bundled tab-plugin extension point exists, and the image plugin (`image-tab-plugin.md`) already did this exact move for a file-opened, payload-carrying view tab, including the generic `plugin` profile entry and the `active` client capability the markdown body needs for its scroll keys. The only piece that needs a decision of its own is Markdown rendering: the client plugin may not import the host's `web/src/markdown.ts`, which the transcript also uses.

## Goal

`open <file>.md` opens a markdown preview tab through a bundled `markdown` tab plugin instead of through the core opener registry and a core `markdown` tab view. Everything the user sees stays the same: the same claimed extensions, the same external-viewer behavior, the same metadata header, the same rendered-and-sanitized Markdown, the same scroll keys, the same tab-strip name and close button, and the same profile save/launch support. Core stops carrying a markdown-shaped tab payload, a markdown opener, a markdown tab creator, and a markdown branch in the client view router.

## Approach

1. **Server plugin.** A new `src/plugins/markdown/` (manifest, import-free shared contract, activation) claims `.md` and `.markdown` with the `text/markdown` content type core serves today, opens/focuses a tab keyed by absolute path, and hands the file to the OS viewer for the external presentation. No declared command (the markdown opener never had one) and no intents — the activation's required `intent` handler rejects every request, exactly as the image plugin's does.

2. **Client plugin.** `web/src/plugins/markdown/` holds the lazily-imported entry, the component, and the scroll-key handler, moved out of `web/src/`. The component takes `{ payload, capabilities }`, fetches its text through `capabilities.resourceUrl(payload.url)` instead of reading the token off the query string, renders the host's split control through `capabilities.splitAction`, and gates its window key listener on `capabilities.active`.

3. **The plugin renders Markdown through its own module.** `web/src/markdown.ts` is a host module and the transcript's Markdown renderer; a concrete client plugin may not import it (`eslint.plugin-boundaries.mjs`), and moving it into the plugin would break the transcript. The plugin therefore calls `marked` and `DOMPurify` — ordinary external dependencies, which plugins may import — from its own `web/src/plugins/markdown/render.ts`, with the same options and the same sanitize-before-insert order. Core keeps its renderer for the transcript. This is two callers of one library rather than a second definition of a host behavior; the alternative (a shared host renderer imported across the plugin boundary) is exactly the coupling the boundary exists to prevent.

4. **Reopening focuses instead of duplicating.** `openOrFocusTab` is the only way a plugin creates a tab, so a second `open notes.md` focuses the tab already showing that file rather than opening a second one. This is the same behavior change the image migration made for the same reason, and it matches how every other plugin tab already behaves.

5. **Profiles reuse the generic `plugin` entry.** `profile save` already writes `{ "type": "plugin", "id", "path" }` for every plugin tab, and `profile launch` already reopens one with `open <path>`, so a markdown tab needs no new profile machinery — only the removal of its own kind. A `type: "markdown"` entry in an existing profile still loads: the loader maps it to a `plugin` entry with id `markdown`, the same compatibility shim `type: "image"` has.

## Implementation steps

### 1 — Server plugin

- `src/plugins/markdown/shared.ts`: `MARKDOWN_PAYLOAD_SCHEMA_VERSION = 1`, `MarkdownPayload` (`name`, `path`, `size`, `url`), `isMarkdownPayload`. Import-free, hand-written guard, mirroring `src/plugins/image/shared.ts`.
- `src/plugins/markdown/manifest.ts`: id `markdown`, version `1.0.0`, `apiVersion` from the host constant, `payloadSchemaVersion` from the shared constant, `tabLabelPrefix: 'markdown'`, `fileExtensions` mapping `.md` and `.markdown` to `text/markdown; charset=utf-8`. No `editGesture` (a `.md` row's activation keeps resolving to `edit`/`open` as it does today) and no `command`. Capabilities: `note`, `openOrFocusTab`, `openExternally`, `rejectRequest`, `reportFailure` — not `configuredViewer`, since the markdown opener has never consulted `externalViewers`.
- `src/plugins/markdown/activate.ts`: `opener.inline` calls `openOrFocusTab(file, …)` producing `{ title: basename, payload: { name, path, size, url: registerFile(file) } }` with `humanSize(statSync(file).size)` and the same `'unknown'` fallback the current opener uses; `opener.external` reproduces `openInDefaultViewer`'s two notes verbatim (`Opening <name> in your default viewer…` / `No viewer available. The file is at <path>`); `intent` validates the authoritative tab payload (`reportFailure` when it is not one of ours) and otherwise rejects with `unknown markdown intent "<name>"`; `isPayload` is the shared guard.
- Register in `src/plugins/catalog.ts` and `src/plugins/loaders.ts`.

### 2 — Remove the core markdown opener

- Delete `src/openers/markdown.ts` and `src/openers/markdown.test.ts`; drop the entry from `src/openers/index.ts`.
- Drop `openMarkdownTab` from `OpenContext` (`src/openers/types.ts`) and from `OpenFileManager.buildContext`.
- In `src/index.ts`, drop the two `/open/`-route markdown MIME lines now supplied by the manifest. Nothing else in core serves `.md`: the map's other users are the web UI's own bundled assets.

### 3 — Remove the core markdown tab

- `src/tab/types.ts`: delete `MarkdownView`, `Tab.markdown`, and `'markdown'` from the view union.
- `src/tab/index.ts` (`makeMarkdownTab`), `src/tab/creators.ts` (`addMarkdownTab`), `src/tab/unique-labels.ts` (`uniqueMarkdownLabel`), `src/tab/openers.ts` (`openMarkdownTab`), `src/tab/opening-state.ts` (`openMarkdownTab`), `src/tab/cleanup.ts` (the `tab.markdown` file-reference release — plugin tabs already release through `fileRefs`), `src/tab/view.ts` (the `markdown` field on the wire view).
- `src/protocol.ts`: drop the `MarkdownView` re-export, the `markdown` field, and `'markdown'` from the view union.

### 4 — Client plugin

- Move `web/src/MarkdownTab.tsx` → `web/src/plugins/markdown/MarkdownTab.tsx` and `web/src/markdown-handlers.ts` → `web/src/plugins/markdown/markdown-handlers.ts`; add `web/src/plugins/markdown/render.ts` (the `marked` + `DOMPurify` call described in Approach 3) and `web/src/plugins/markdown/index.tsx` default-exporting the component and named-exporting `isPayload` from `@shared/plugins/markdown/shared`.
- The component takes `{ payload, capabilities }`: the fetch URL becomes `capabilities.resourceUrl(payload.url)`, the header's split control becomes `capabilities.splitAction`, and the key listener binds only while `capabilities.active`.
- `web/src/plugins/registry.tsx`: add the `markdown` loader and registration with its schema-version literal.
- `web/src/ViewTabBody.tsx`: drop the markdown branch and its import; `web/src/TabItem.tsx`: drop `tab.markdown?.name` from the rename prefill chain (a plugin tab's `title` already carries the file name); `web/src/useViewSearchState.ts`: drop `markdown` from the view-tab kinds (`plugin` already covers it).
- Delete `web/src/MarkdownTab.test.tsx` after porting its cases.

### 5 — Profiles

- `src/profile/types.ts`: drop the `markdown` member of `ProfileViewEntry`, keeping `ProfileMarkdownTabFile` as the legacy on-disk input shape.
- `src/profile/file.ts`: map a legacy `markdown` entry to `{ type: 'plugin', id: 'markdown', path }` beside the existing `image` shim, and drop the now-unreachable default arm.
- `src/profile/view-tabs.ts`: drop the markdown target; the `plugin` target becomes the switch's default arm.
- `src/profile/save-entries.ts`: delete `writeMarkdownEntry`.
- `src/profile/save-route.ts` and `src/profile/save.ts`: drop the `markdown` case, its counter, and its line in the save report — a markdown tab is now counted as a plugin tab.
- `src/profile/schema.ts`: keep `markdown` in the recognized tab types and the presentation-carrying types (a saved profile must keep launching), updating the comments that explain why both `image` and `markdown` are legacy spellings.

## Tests

Server (`src/plugins/markdown/activate.test.ts`, modeled on `src/plugins/image/activate.test.ts`):

- `open <file>.md` inline produces a tab whose payload carries name, path, human-readable size, and the registered url, and titles the tab with the file's basename.
- A second inline open of the same path focuses the existing tab instead of registering a second file reference.
- `open external <file>.md` notes the viewer line when the OS open succeeds and the fallback path line when it does not.
- An unknown intent is rejected without disabling the plugin; an intent arriving with a tab payload that is not a markdown payload reports a failure.
- `isMarkdownPayload` accepts a complete payload and rejects `null`, an array, and each missing field.
- The size lookup falling back to `unknown` when the file disappears between dispatch and payload construction.

Profiles:

- `src/profile/save.test.ts`: an open markdown tab saves as a `plugin` entry carrying id `markdown` and a `$root`-relative path, counted in the report's plugin-tab total.
- `src/profile/file.test.ts`: a legacy `markdown` entry loads as a `plugin` view entry with id `markdown`.
- `src/profile/view-tabs.test.ts`: a legacy `markdown` entry opens its tab and places it in its authored group.

Client (`web/src/plugins/markdown/MarkdownTab.test.tsx`, ported from the existing suite):

- Renders name, size, and location, and the fetched Markdown as sanitized HTML from the capability-provided source.
- Falls back to the file's plain text when rendering fails and to a failure line when the fetch rejects.
- Renders the host's split action when one is supplied and nothing when it is not.
- Arrow and Page Up/Down keys scroll the stage while the tab is active and are ignored while it is not.
- `web/src/plugins/registry.test.tsx`: the markdown registration's schema-version literal matches the plugin's own constant.

## Out of scope

- Any change to how the markdown view looks or behaves for the user beyond what the migration forces (the reopen-focuses behavior in Approach 4 is the one forced change).
- A `markdown <path>` command. `open` has always been the only way to open a preview.
- Live reload of a preview when the file changes on disk; it remains a snapshot taken at open time.
- The transcript's own Markdown rendering and `web/src/markdown.ts`, which stay in core.
- Changes to the image or video plugins.
- Persisting markdown tabs to agent state or restoring them on `--relaunch`; they remain live, in-memory views.
