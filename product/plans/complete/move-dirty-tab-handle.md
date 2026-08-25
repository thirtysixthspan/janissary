# Move the dirty-tab handle to the surface-neutral tab handles module

**Complexity: 4/10** — a shared TypeScript contract moves between two existing client modules and its direct type-only importers are repointed. The runtime component behavior and handle shape remain unchanged.

## Goal

Make `DirtyTabHandle` the shared contract for any tab surface that can report unsaved work, without requiring app-level modules to import the editor component that happens to implement it.

## Approach

`web/src/tab-handles.ts` already holds imperative tab-surface contracts. Add `DirtyTabHandle` there and make `EditorTab` publish that imported contract through its ref. Repoint every app, pure-module, hook, and test reference from `EditorTabHandle` to the new direct defining module. `MountedViewLayers` retains its value import of `EditorTab` but gets its type from `tab-handles`.

## Implementation steps

1. Add the `DirtyTabHandle` type to `web/src/tab-handles.ts` with the existing `isDirty`, `save`, and `focus` members.
2. Update `web/src/editor/EditorTab.tsx` to import and use `DirtyTabHandle`, removing its local `EditorTabHandle` declaration without leaving a re-export.
3. Repoint the six application imports in `App.tsx`, `AppMain.tsx`, `CloseSaveGuard.tsx`, `dirtyTabs.ts`, `useUnsavedQuitGuard.ts`, and `MountedViewLayers.tsx` to `tab-handles` and use the renamed contract. Correct the plugin API comment that identifies this shared shape by the old contract name.
4. Repoint the five listed tests and the additional direct consumer discovered by typechecking, `web/src/editor/EditorTab.test.tsx`, to `DirtyTabHandle` from `tab-handles` so type coverage follows the public contract.

## Tests

- Update the existing handle-using tests in `web/src/CloseSaveGuard.test.tsx`, `web/src/MountedViewLayers.test.tsx`, `web/src/MountedViewLayers.video-playback.test.tsx`, `web/src/dirtyTabs.test.ts`, `web/src/useUnsavedQuitGuard.test.ts`, and `web/src/editor/EditorTab.test.tsx` to compile against `DirtyTabHandle`.
- Run `./scripts/run.mjs check-diff` after each implementation step. The existing tests continue to cover clean, dirty, and plugin-provided tab handles while typechecking confirms all consumers use the shared contract.

## Spec updates

None. This is a source-level refactor with no user-visible behavior change.

## Docs

Checked `help.md` and `documentation/user-documentation/`; neither documents this internal TypeScript contract, so no update is needed.

## Out of scope

- Changing any dirty-tab behavior or the handle's methods.
- Changing plugin API documentation or tab mounting behavior.
- Moving other tab handle contracts.
