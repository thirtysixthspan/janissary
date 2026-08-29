# Decouple the file navigator's multi-open classification from the image plugin

**Complexity: 4/10** — a localized web-client refactor: one new app-shell module, one new prop on `FileNavigatorTab`, two render sites to pass it, plus test moves. No server, protocol, or plugin-contract changes.

## Summary

`web/src/file-navigator/FileNavigatorTab.tsx` imports the image plugin's concrete `isImagePath` predicate from `@shared/plugins/image/shared` to decide whether Open/Edit on a row inside a multi-row selection fans out to every selected image. That is a cross-feature import against a concrete plugin (react-code-organization §3), and it pulls a plugin's guards into the navigator's chunk graph ahead of the lazy plugin loader.

Move the classification behind a host-owned query: a new `web/src/multi-open.ts` owns the extension set and exports `multiOpenablePaths(paths)`; `FileNavigatorTab` receives the classifier as an optional prop from the app shell (`ViewTabBody`, `Sidebar`), and the concrete plugin import is gone. The predicate's own definition and its tests are removed from the image plugin; the host module's extension list is pinned against the image manifest's declared `fileExtensions` keys, mirroring how `registry.test.tsx` pins schema literals.

## Design decisions

1. **App-shell-injected classifier, not a navigator-side feature module.** react-code-organization §3 assigns cross-feature coordination to the composing layer. `ViewTabBody` and `Sidebar` (the only two renderers) pass the predicate in; the navigator stays free of plugin and app-shell knowledge.

2. **The host owns its own extension list.** The client host may not runtime-import a plugin shared contract (eslint plugin boundaries guard the entry bundle), so the classifier module holds the image extensions as data — the same trade `web/src/plugins/registry.tsx` makes for schema literals. A pinning test makes drift fail loudly instead of silently.

3. **Remove the predicate from the plugin entirely.** Once the navigator stops importing it, `isImagePath` in `src/plugins/image/shared.ts` and its `describe` block in `activate.test.ts` serve nothing but tests. Deleting both finishes the decoupling instead of leaving a test-only export behind; extension ownership moves to the manifest's `fileExtensions` claims, which is the source of truth the pinning test checks against.

4. **Behavior stays byte-identical.** Open/Edit fan-out still triggers only for a selection of two or more rows, all image extensions (case-insensitive), when the clicked row belongs to that selection. Mixed selections, single rows, and docked navigators behave exactly as before — the docked navigator (`Sidebar`) receives the same prop as the center one (`ViewTabBody`).

## Implementation steps

1. Add `web/src/multi-open.ts`: a comment explaining the host-owned literal + pinning strategy, the extension set, and `multiOpenablePaths(paths: string[]): string[] | null` returning all paths when every one qualifies (two or more), `null` otherwise.
2. Extend `FileNavigatorTabProperties` in `web/src/file-navigator/file-navigator-tab-types.ts` with an optional `multiOpen?: (paths: string[]) => string[] | null`, documented like the existing commented fields.
3. In `web/src/file-navigator/FileNavigatorTab.tsx`, drop the `@shared/plugins/image/shared` import, replace the `selectedImages` computation with the prop, and rename its uses in `menuActions.open`/`menuActions.edit`.
4. In `web/src/ViewTabBody.tsx` and `web/src/Sidebar.tsx`, pass `multiOpen={multiOpenablePaths}`.
5. Remove `isImagePath` (and the now-unused `IMAGE_EXTENSIONS` set) from `src/plugins/image/shared.ts`, and remove its `describe` block (and import entry) from `src/plugins/image/activate.test.ts`.

## Tests

- New `web/src/multi-open.test.ts`: fan-out for an all-image selection; `null` for one-row, mixed, and empty selections; case-insensitive extension matching; and a pinning test that the extension list equals the image manifest's declared `fileExtensions` keys.
- Update the two fan-out specs in `web/src/file-navigator/FileNavigatorTab.test.tsx` ("opens/edits every selected image from a selected image row") to pass the new prop.
- The image-plugin test file loses the removed `isImagePath` block; everything else there is unchanged.

## Out of scope

- Generalizing fan-out to audio, video, or markdown selections — the behavior is image-only by spec, and only images fan out.
- Server-side classification via a new RPC or protocol field — unnecessary for removing one import.
- Touching `help.md` or `documentation/user-documentation/` — behavior is unchanged, and neither documents internals.
- Touching the image plugin's activate/manifest contract — manifest stays the claim source; the pinning test reads it.

## Implementation order

1. `web/src/multi-open.ts` + `web/src/multi-open.test.ts`.
2. Prop type, `FileNavigatorTab.tsx`, both render sites, and the two test updates.
3. `shared.ts`/`activate.test.ts` removal of `isImagePath`.
4. `./scripts/run.mjs check-diff` after each step.
