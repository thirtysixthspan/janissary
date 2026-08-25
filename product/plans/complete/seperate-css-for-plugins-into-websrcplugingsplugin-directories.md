# seperate css for plugins into web/src/plugings/plugin directories

**Complexity: 3/10** — the work is a client-only stylesheet and markup reorganization across seven lazy plugin entries, with care needed to preserve shared-selector cascade and the existing CSS-source tests.

Plugin CSS will move out of the application-wide `web/src/theme.css` and into the lazy client-plugin directories that render it. Each production plugin will load its own stylesheet with its existing lazy entry, while genuinely shared plugin rules will live in one shared plugin stylesheet. This makes styling ownership match the plugin architecture without changing the rendered UI.

## Design decisions

**Each production plugin loads its own stylesheet from its lazy entry module.** Audio, image, markdown, page, schedules, and video each import their colocated stylesheet through the existing `index.tsx` module that the client registry already lazy-loads. Their CSS therefore follows the same loading boundary as their component code.

**Shared plugin rules are deduplicated where reasonable.** Rules used only by multiple plugins move to `web/src/plugins/shared.css`; plugin-only rules stay with their owning plugin. Rules also consumed by host components remain in `theme.css`, with mixed selector lists split so they do not make lazy plugin CSS eager. The shared stylesheet is imported by affected plugin entries.

**The fixture demonstrates the stylesheet convention.** `fixture-v1` receives the same colocated stylesheet setup as the six production plugins, giving the frozen compatibility fixture a concrete, minimal example of the expected client-plugin structure.

**The shared layout classes get neutral plugin names.** Rename the existing image-prefixed container and metadata classes used by audio, markdown, and video to neutral shared-plugin names, and update their components and tests together. Keep image-only orientation, zoom, and pan classes image-specific; keep `.tab-split` host-owned. The rendered layout and interaction do not intentionally change.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Single global application stylesheet and its client entry import | `web/src/theme.css`, `web/src/main.tsx` |
| Lazy client-plugin boundary | `web/src/plugins/registry.tsx` (`clientPluginLoaders`) |
| Production plugin entry modules that define the chunk boundary | `web/src/plugins/{audio,image,markdown,page,schedules,video}/index.tsx` |
| Existing shared visual primitives used across plugin views | `web/src/theme.css:197` (`.image-tab`, `.image-meta`, `.image-stage`) |
| Host-owned split control also rendered by plugins | `web/src/SplitTabButton.tsx:9` (`.tab-split`), `web/src/theme.css:185` |
| Existing stylesheet-source tests, including mixed plugin and host metadata selectors | `web/src/theme.test.ts:15` |
| Frozen client-plugin fixture | `web/src/plugins/fixture-v1/index.tsx`, `web/src/plugins/fixture-v1/compatibility.test.tsx` |

## Proposed changes

Create a stylesheet next to every production client plugin's entry module and import it from that entry module. Move selectors owned only by that plugin out of `web/src/theme.css`, preserving their theme custom-property use and the current cascade behavior. The local stylesheets are `audio.css`, `image.css`, `markdown.css`, `page.css`, `schedules.css`, and `video.css`, alongside their respective `index.tsx` entries.

Add `web/src/plugins/shared.css` for rules with more than one plugin consumer and no host consumer. Update the affected plugin entry modules to load it alongside their local stylesheet. Keep host frames, global theme declarations, non-plugin tab rules, and `.tab-split` in `web/src/theme.css`, because `SplitTabButton` renders the latter outside any plugin. Split the existing mixed metadata and action selector lists so host selectors remain in `theme.css` and plugin selectors move with their owners, without changing their declarations.

Rename the shared image-prefixed container and metadata selectors used by audio, markdown, and video to neutral plugin names, then update their component markup and existing component-test selectors together. Keep genuinely image-specific orientation, zoom, and pan selectors in `image.css`; documentation screenshots use stable `data-doc-shot` attributes and need no selector migration.

Add an empty `fixture-v1.css` and import it from `fixture-v1/index.tsx`, without changing the fixture's markup, behavior, or compatibility contract. It is a structural example, not a new style layer.

Remove the migrated plugin-owned and shared-plugin rules from `web/src/theme.css`; leave no duplicate declarations behind. Preserve the existing order where it affects cascade or selector specificity.

## Tests

Update existing plugin component tests under `web/src/plugins/**` for any renamed classes while preserving their behavior assertions.

Update `web/src/theme.test.ts` to assert the retained host selector lists after mixed rules are split. Extend `web/src/plugins/registry.test.tsx` to invoke every `clientPluginLoaders` loader successfully after its stylesheet import, and retain `web/src/plugins/fixture-v1/compatibility.test.tsx` as the fixture contract check. Existing plugin component tests cover the renamed DOM classes.

Run the web test suite and the repository diff check to catch stylesheet-resolution, TypeScript, lint, and unintended generated-file changes.

## Out of scope

- Visual redesign or intentional layout and interaction changes.
- Moving host-owned frames, controls, global palette declarations, or non-plugin tab CSS out of `web/src/theme.css`.
- New plugin APIs, protocol changes, or changes to server-side plugins.

## Open questions

None.

## Verification

Run `./scripts/run.mjs check-diff`.

Manually open each production plugin view, including a docked audio or schedules tab, and confirm its layout matches the current application under more than one application theme. Confirm the fixture plugin still lazy-loads in its compatibility test.
