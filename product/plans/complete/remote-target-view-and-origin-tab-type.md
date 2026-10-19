# Remote target view and named origin-tab type

Status: Complete.

## Goal

Use the protocol-owned `RemoteTargetView` wherever a tab or file navigator exposes remote target view state, and give the plugin `originTab` return shape a named exported type.

## Design

`src/protocol/tab.ts` remains the owner of `RemoteTargetView`. Replace the structurally repeated intersections in `src/tab/types.ts` and `src/tab/remote-file-navigator-view.ts` with imports of that type. Define `TabPluginOriginTab` in the adjacent `src/plugins/api-origin-tab.ts` contract module, import and export it through `src/plugins/api.ts` beside `TabPluginServerCapabilities`, and use it in the `originTab` method signature. Preserve the existing return fields and the literal `true` types for `remote` and `provisioning`.

These are type-only changes. They do not change the remote view payload or plugin capability behavior, so functional specs and user documentation need no update.

## Verification

Run `./scripts/run.mjs check-diff` after implementation. The affected tab and plugin implementations are checked by TypeScript, and the diff-scoped test runner selects the relevant suites.

## Result

The tab and file navigator now refer to `RemoteTargetView`; the plugin capability declares and uses `TabPluginOriginTab`. No runtime behavior changed, so the relevant spec and user documentation remain unchanged.
