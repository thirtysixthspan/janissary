# Keep docked image edits in the quit save walk

**Complexity: 3/10** — the application already owns plugin dirty handles and the quit walk. Docked plugin bodies only need the same registration callback as center plugin bodies, plus one integration case covering the missing route.

## Goal

An edited image keeps its dirty handle registered while its docked tab remains open, even when the user selects another entry in the sidebar. Typing `quit` then reveals the image's titled save dialog, and Cancel leaves the app open with its edits intact.

## Approach

Move the existing plugin-handle registration behavior to one callback owned by `App.tsx`. Pass it to the center plugin layer and through `AppShell`, `Sidebar`, and `DockedPluginBody`. The callback stores or removes the handle in the shared map and updates the plugin unsaved marker. Pass that marker state to the sidebar tab strips so the selected Notifications row does not hide the image's unsaved marker. The docked body already stays mounted while another sidebar entry is selected; closing the image unmounts it and its existing effect unregisters the handle.

## Implementation steps

1. Add a single plugin dirty-handle callback in `App.tsx` and use it for both center and docked plugins.
2. Thread the callback through the app shell and sidebar into `DockedPluginBody` without changing the plugin contract, and pass dirty plugin labels to the sidebar tab strips.
3. Add an `App.test.tsx` integration case using the real image plugin: rotate an image docked beside Notifications, select Notifications, verify the unsaved marker remains, type `quit`, verify the image save dialog appears, then Cancel and verify the image edit remains available.
4. Update `product/specs/quit-confirmation.md` to state that a dirty docked plugin remains in the quit walk when another sidebar entry is selected. Existing image editor suites continue to cover save, undo, and clean quit behavior.

## Tests

- `web/src/App.test.tsx` — docked image edit, sidebar selection change, quit save walk, and Cancel preservation.
- Existing `web/src/plugins/image/ImageEditor.test.tsx` and quit confirmation tests — image save/undo behavior and plain quit behavior.
- Run the diff-scoped lint, typecheck, server tests, and web tests with `./scripts/run.mjs check-diff` after each code or test change.

## Out of scope

- Changes to image editing, saving, undo, or the plugin capability contract.
- Other docked-tab lifecycle or quit-walk changes.
- PR title or description changes.
