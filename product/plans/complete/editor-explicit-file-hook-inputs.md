# Explicit inputs for the editor file lifecycle hooks
**Complexity: 5/10** — ~90 added lines, 3 production files edited, 6 requirements, 8 scenarios (p=5.37)

## Goal

Stop `useEditorFile` and `useEditorWatchReload` from sharing a raw mutable `{ generation, url }` object, and remove the two `react-hooks/exhaustive-deps` suppressions in those files so the dependency lists are checked against what the effects read. Behavior does not change.

## Approach

- Add `web/src/editor/document-reads.ts`, a framework-free class `DocumentReads` held in a `useState` initialiser (the way `SaveCoordinator` is). `begin()` bumps the generation and returns `{ isCurrent(), cancel() }`. `isCurrent()` is true while no later `begin` has happened. `cancel()` invalidates the read only if it is still the current one.
- `useEditorFile` creates one `DocumentReads`, uses it for the initial load, and passes it to `useEditorWatchReload`.
- `useEditorWatchReload` takes a single options object (`mtimeMs`, `dirty`, `conflictPendingRef`, `api`, `setBaseline`, `client`, `url`, `initialLine`, `reads`). The `setLastSaved` parameter is renamed `setBaseline`, matching what it is handed.
- Both hooks hold the latest `client`, `api`, and `initialLine` / `editor.line` / `editor.newFile` in `useLatestRef` and read `.current` inside effects, so the effects declare honest dependencies and the suppressions go.
- `writeRef.current = writeToDisk` in `useEditorFile` becomes a `useLatestRef`.
- The suppressions in `EditorTab.tsx`, `useEditorLineJump.ts`, and `useEditorSuggest.ts` are out of scope.

## Tests

- `document-reads.test.ts`: a fresh read is current; a later `begin` invalidates the earlier read; `cancel` invalidates the current read; `cancel` of a superseded read does not invalidate the newer one.
- `useEditorWatchReload.test.ts`: update the harness to the options object; the existing cases (clean reload, dirty sets conflict, superseded read ignored, failure leaves buffer) already state the external-change behavior.
- `useEditorFile.test.ts` and `EditorTab.test.tsx` must keep passing unchanged.

## Out of scope

Other `exhaustive-deps` suppressions in the editor, the `savedFlash` timer, and any behavior change.
