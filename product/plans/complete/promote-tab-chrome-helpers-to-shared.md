# Promote the tab-chrome helpers to `web/src/shared` and zone plugins, toasts, and context-menu

**Complexity: 4/10** — three file moves with import-path fixes across about a dozen importers, one list edit in `eslint.config.mjs`, and one test relocation. No runtime behavior changes; the compiler and the new lint zones verify every step mechanically.

## Goal

`web/src/tab-body-border.ts` (with `tab-body-border.test.ts`), `web/src/dock-cycle.ts`, and `web/src/DockCycleHeader.tsx` live in `web/src/shared/`. Each has more than one feature consumer, which is the promotion trigger in `ai/guidelines/react-code-organization.md` §2. Every importer points at the new path and no re-export is left behind.

`plugins`, `toasts`, and `context-menu` join `clientFeatureDirectories` in `eslint.config.mjs`, so a sibling-feature import into or out of any of them, or a shared module importing one of them, fails lint the same way it already does for the eight existing feature directories.

## Approach

The moves are mechanical. `tab-body-border.ts` is imported by `agent-tabs/AgentTabBody.tsx`, `agent-tabs/InactiveAgentTabBody.tsx`, `harness/HarnessTabLayer.tsx`, `plugins/PluginTabLayer.tsx`, and the root-level `ShellTabLayer.tsx`, `MountedViewLayers.tsx`, and `ViewTabBody.tsx`. `dock-cycle.ts` is imported by `file-navigator/FileNavigatorTab.tsx`, `file-navigator/FileNavigatorHeader.tsx`, and `DockCycleHeader.tsx`. `DockCycleHeader.tsx` is imported by `plugins/DockedPluginBody.tsx` and the root-level `NotificationsTab.tsx`. `DockCycleHeader.tsx` keeps its type-only `JanusClient` import from `../ws` (the same pattern `shared/agent-tab-intents.ts` already uses) and its `./shared/icons` import becomes a same-directory `./icons`.

None of the three new zone directories imports a zoned feature today, at any relative depth, and no zoned feature or shared module imports `plugins` or `toasts`. The one cross-feature import the new zones report is in a test: `web/src/harness/HarnessTab.test.tsx` imports `../context-menu/DefaultContextMenu` for three integration cases that render the harness tab beside the app-level default context menu and assert the menu a terminal selection produces. That pairing is app-shell composition (`AppShell.tsx` is where both are mounted), so per §3 the coordination test belongs at the app-shell level rather than inside either feature. Move those three cases into a new root-level `web/src/harness-selection-menu.test.tsx` with the minimal xterm, clipboard, and ResizeObserver doubles they need, and drop the `DefaultContextMenu` import from the harness test. An `eslint-disable` comment was rejected: it would leave the boundary unenforced for exactly the import the zone exists to catch.

The plugin tree keeps its stricter plugin-specific rules in `eslint.plugin-boundaries.mjs`; the new zone is additive and does not conflict with them, because the client plugin host's rule only restricts `./<plugin>/` paths and `@shared/plugins/` runtime imports, and the moved modules are reached as `../shared/...`.

## Implementation steps

1. `git mv` `web/src/tab-body-border.ts`, `web/src/tab-body-border.test.ts`, `web/src/dock-cycle.ts`, and `web/src/DockCycleHeader.tsx` into `web/src/shared/`.
2. Repoint every importer: feature files from `../<module>` to `../shared/<module>`, root files from `./<module>` to `./shared/<module>`, and inside `shared/DockCycleHeader.tsx` fix `./ws` to `../ws` and `./shared/icons` to `./icons`.
3. Move the three `DefaultContextMenu` integration cases from `web/src/harness/HarnessTab.test.tsx` into `web/src/harness-selection-menu.test.tsx`, and remove the now-unused import.
4. Add `plugins`, `toasts`, and `context-menu` to `clientFeatureDirectories` in `eslint.config.mjs`.
5. Add boundary cases to `src/eslint-feature-boundaries.test.ts` pinning the three new zones.
6. Run `./scripts/run.mjs check-diff` after each step.

## Tests

- `web/src/shared/tab-body-border.test.ts` passes unchanged from its new location.
- The consumer tests (`web/src/agent-tabs/*.test.tsx`, `web/src/file-navigator/FileNavigatorTab.test.tsx`, `web/src/plugins/DockedPluginBody.test.tsx`, `web/src/plugins/PluginTabLayer.test.tsx`, `web/src/NotificationsTab.test.tsx`, `web/src/ShellTabLayer.test.tsx`, `web/src/MountedViewLayers.test.tsx`, `web/src/ViewTabBody.test.tsx`) pass with no edits.
- `web/src/harness-selection-menu.test.tsx` runs the three relocated cases with their assertions unchanged: the manual right-click menu offers `Copy` and `Chat about this` and sends only the held selection, Escape on the auto-opened menu exits copy mode, and the menu's Copy entry copies and releases the selection.
- `src/eslint-feature-boundaries.test.ts` gains cases asserting that a `plugins` module importing a zoned feature is rejected, that a zoned feature importing `context-menu` is rejected, and that a shared module importing `toasts` is rejected.

## Out of scope

- `web/src/ws.ts` and `web/src/api.ts`, which features import from the root dozens of times; the entry defers them to a later increment.
- Any other root-level module, including `Sidebar.tsx` and `session-url.ts`, which plugin files import from the root today.
- Any change to what the moved modules export or render, and any spec, help, or user-documentation change, since nothing user-visible changes.
