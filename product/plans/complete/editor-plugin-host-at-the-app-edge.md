# Build the editor plugin host at the edge that owns the editor tabs

## Complexity

4/10 — one new hook, two modules rewired, one component taking an injectable seam. No behavior change; the host is created in one place instead of on import, and tests can now inject it without reaching for a default parameter.

## Goal

`web/src/editor/plugins/useEditorPlugins.ts` creates its `pendingReports` array and the editor plugin host at module scope, so a host instance and a mutable queue come into existence the first time the module is imported and are shared by every editor tab for the life of the page. The equivalent overlay host is built in a `useMemo` at the app shell and disposed in an effect cleanup. The module-level pair also outlives unmount and cannot be swapped without going through the default-parameter seam, and a report queued when a plugin is disabled after mount is drained by whichever tab mounts next, sending it under that tab's `url`.

## Approach

Build one host in the composition that owns the editor tabs — `MountedViewLayers`, which is rendered once and mounts every editor tab — through a hook that mirrors `useOverlayPlugins`: a `useMemo` for the host whose `onDisabled` pushes onto a queue the hook owns, and the pair handed to each `EditorTab` the way `client` is. `useEditorPlugins` keeps its parameters, so its coverage keeps passing, but they are no longer defaulted from module state: the host is required and only the queue keeps a default, which is what tests use. `EditorTab`'s two new props are optional with a tab-local fallback host, because `EditorTab` is rendered from fifty-odd test sites that have no session host to hand it; production always passes the shared one. The host holds no subscriptions or listeners, so unlike the overlay host it has nothing a dispose would release — construction at the edge with the window's lifetime is the whole gain. Report attribution stays as it is: the report carries no `url`, so the tab that drains the queue sends under its own, exactly as today.

## Implementation

1. Add `web/src/useEditorPluginHost.ts` exporting `useEditorPluginHost(client)`: a stable `reports` queue held in a ref, the host built in a `useMemo` whose `onDisabled` pushes `{ plugin, reason }` onto it, and both returned as `{ host, reports }`.
2. In `web/src/editor/plugins/useEditorPlugins.ts`, delete the module-level `pendingReports` and `sessionHost` and their comments; make `host` a required parameter and keep `reports: PluginReport[] = []`.
3. In `web/src/editor/EditorTab.tsx`, take optional `pluginHost` and `pluginReports` props, resolve the host through a `useMemo` fallback for a caller that passes neither, and hand both to `useEditorPlugins`.
4. In `web/src/MountedViewLayers.tsx`, call `useEditorPluginHost(client)` once and pass the host and queue to every `EditorTab`.
5. Run `./scripts/run.mjs check-diff` after each step.

## Tests

- `web/src/editor/plugins/useEditorPlugins.test.ts` passes unchanged: it already injects a host and a reports array through the seam, which is now the only way in.
- `web/src/editor/EditorTab.test.tsx`, `EditorTab.window-keys.test.tsx`, and `useSectionNav.editor.test.tsx` pass unchanged — they render `EditorTab` without the new props and get the tab-local fallback host, which is a stricter arrangement than the shared module host they had.
- The `MountedViewLayers` suites pass unchanged: the hook constructs a real host with a no-op disable sink, which is the same pure validation the module-level host ran at import.

## Out of scope

- Report attribution: a report drained by a later tab still sends under that tab's `url`. Fixing it means the report carrying its own `url`, which changes the shape `useEditorPlugins.test.ts` pins.
- A `dispose` on the editor host; it holds no subscriptions, timers, or listeners.
- Any change to which chord fires which plugin, or to the disabled-plugin contract with the server.

## Verification

- `./scripts/run.mjs check-diff` passes after each step.
- A search for `sessionHost` and `pendingReports` finds nothing under `web/src`.
- `useEditorPlugins.ts` exports no mutable module state: its only exports are the `PluginReport` type and the hook.

## Documentation and specification impact

None. This is a construction-ownership change with no user-visible behavior difference; no spec, `help.md`, or user documentation describes where the host is built.
