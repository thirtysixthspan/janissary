# Preserve image edits when docking before quit

**Complexity: 6/10** — the repair crosses the image hook, the host-owned plugin capability, both plugin mount paths, and App's per-tab lifecycle. The shared state is transient, bound to one open label, and discarded when that tab closes; the dirty handle must survive the placement remount for the same lifetime.

## Goal

Keep an edited image's operation history, saved-operation baseline, source dimensions, and dirty handle when the user docks the image from the center beside another sidebar entry. Selecting Notifications and starting `quit` must still open the titled Save / Don't Save / Cancel walk, and Cancel must leave the image's edit and Undo action available.

Keep the existing already-docked selection case, image save and undo behavior, and plain quit behavior covered.

## Approach

The center and sidebar currently mount separate `PluginBody` trees for the same tab label. Keep their component lifecycle intact and give each body a narrow, host-provided per-tab state capability. An App-owned store holds the image edit snapshot by label and key while the tab remains open; it removes all state for a label as soon as a server snapshot closes that tab. The image hook writes its current edit snapshot and restores it on the next mount. The capability is optional and additive, so the current plugin API version stays compatible.

The App also retains an existing plugin dirty handle when a body unregisters while its label is still open. The sidebar body replaces that handle when it mounts. The App removes the handle and dirty marker when a server snapshot removes the label.

## Implementation

1. Add a framework-free per-tab plugin state store with stable per-label accessors, `get`, `set`, and `delete`, and an operation that disposes entries whose labels are no longer open.
2. Add an optional `tabState` client capability and pass the bound accessor from App through `AppMain`, `AppShell`, `Sidebar`, `MountedViewLayers`, and the two plugin body layers. Keep the capability documented as additive under API v3.
3. Update `useImageEdit` to initialize and synchronize its edit model, source dimensions, and saved-operation baseline through that capability. Keep its dirty handle registered while the tab remains open across a placement remount; let App remove it on close.
4. Extend the App integration coverage with the center image → rotate → dock beside Notifications → select Notifications → quit → verify titled choices → cancel → verify Undo remains available flow. Preserve the already-docked case and existing image save/undo and plain quit coverage.

## Tests

- Add store tests for state surviving another accessor lookup and being inaccessible after its label closes.
- Extend `web/src/App.test.tsx` with the center-to-sidebar quit walk described above. Assert the image's dirty marker remains visible after docking and the edit remains available after cancel.
- Run `$janissary/scripts/run.mjs check-diff` after each implementation step.

## Specs and documentation

- Update `product/specs/image-tab.md` to state that unsaved image edits survive docking and remain guarded until saved or the tab closes.
- Update `product/specs/tab-plugins.md` and `documentation/developer-documentation/tab-plugins.md` to describe the optional per-tab state capability and that it is additive in API v3.
- Update `documentation/user-documentation/tab-types/image-viewer.md` to make clear that docking an image tab keeps its unsaved edits with the open tab.

## Out of scope

- No change to how image operations render, save, undo, or redo.
- No change to the quit save walk's wording or button behavior.
- No change to the server tab protocol or to when center and sidebar bodies mount.
- No change to the PR description.
