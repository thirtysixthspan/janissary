# Honor explicit dirty-handle unregistration

**Complexity: 4/10** — the host registry needs to honor an explicit `null`, while image view teardown must leave its tab-scoped handle available for placement remounts. The change touches one app callback, one plugin hook, their tests, and the public contract.

## Goal

Make `registerDirtyHandle(null)` remove the tab's registered save handle and clear its unsaved marker while the tab remains open. Preserve image edits and their dirty handle when moving the image tab between the center and a sidebar, where the plugin body can unmount and mount again.

## Approach

Treat `null` as an explicit host registration update: delete the label's handle and recompute its dirty marker as clean. A placement unmount is not a tab close, so the image editor will stop unregistering from its effect cleanup; its current handle remains in the host map until the tab closes or registers a replacement. Closed-label pruning in `web/src/plugins/prune-closed-plugin-tabs.ts` continues to own cleanup on tab close.

Document this lifecycle in the tab-plugin capability contract and developer documentation, and reflect the user-visible marker and save-prompt behavior in the tab-plugin spec.

## Implementation steps

1. Update `App.registerPluginDirtyHandle` in `web/src/App.tsx` so a `null` registration always deletes the handle for that label and recomputes its marker.
2. Update the registration effect in `web/src/plugins/image/useImageEdit.ts` to register the current handle without returning a cleanup that sends `null`. Keep registering again when the dirty answer changes, and update `web/src/plugins/image/ImageEditor.test.tsx` so a view unmount does not imply an unregister.
3. Clarify in `web/src/plugins/api.ts` and `documentation/developer-documentation/tab-plugins.md` that `null` explicitly drops a registration, tab close is pruned by the host, and view unmount can happen during placement changes.
4. Update `product/specs/tab-plugins.md` to state that dropping a handle while the tab remains open clears its unsaved marker and removes its save prompt.
5. Update `web/src/App.test.tsx` with an integration case where an open plugin tab registers then explicitly drops a dirty handle; verify its marker clears and a subsequent quit does not ask that handle to save. Retain and run the existing docking and closed-label pruning coverage.

## Tests

- `web/src/App.test.tsx`: explicit unregistration clears the visible marker and the quit walk does not call the removed save handle; existing center-to-sidebar remount and closed-label pruning cases continue to pass.
- `web/src/plugins/image/ImageEditor.test.tsx`: the image editor publishes its handle as state changes and does not unregister merely because its view unmounts.
- `web/src/plugins/PluginTabLayer.test.tsx` and `web/src/plugins/tab-state-store.test.ts`: existing explicit-null forwarding and closed-tab cleanup behavior remains intact.

## Outcome and verification

The host now removes an explicitly dropped handle and clears its marker. The image editor keeps the handle through placement unmounts, while the host's closed-label pruning still owns tab-close cleanup. `./scripts/run.mjs check-diff` passed lint, typecheck, and the selected web tests after the code, documentation, spec, and integration-test changes.

## Out of scope

- Changing the quit walk, single-tab close flow, save dialog, or server protocol.
- Changing the semantics of `registerDirtyHandle(handle)` or the closed-label pruning path.
- Updating the pull request description or consolidating the separate implementation subplans.
