# Drop a pending reveal focus hint on a click that keeps the selection

**Complexity: 2/10** — 2 production lines across 2 files and 2 requirements, with 2 test scenarios (p=3.47).

The editor's reveal writes a pending focus hint for a row that may not have arrived yet. `useFileNavigatorSelection` already drops that hint from `replace`, `extend`, `selectSiblings`, and `pointer`, and `onRowMouseDown` routes a normal left-click through `selection.pointer`. But when the clicked row is already selected and no modifier is held, `onRowMouseDown` takes its `keepSelection` branch and calls neither `pointer` nor `dropPendingFocus`, so the hint stays pending and later replaces the user's selection when its row arrives. The spec says a pending selection is dropped if the user clicks a row first.

## Goal

Make every unmodified left-button mousedown on a row drop a pending reveal focus hint, including a click on a row that is already selected, while leaving the click's selection, drag, and pointer behavior unchanged.

## Approach

Expose the hook's existing `dropPendingFocus` callback in its result beside `focusHint`. In `onRowMouseDown`, call it once after the rename-input guard and before the `keepSelection` branch, so the drop happens for every left-button press on a row regardless of which selection branch follows. The `pointer` path keeps its own drop for its other callers; a second call in the same press is an idempotent no-op because the outcome is already `dropped`.

Do not move the drop into the right-click, drag, or header handlers: the row's left-button mousedown is the click the spec names.

## Implementation steps

1. In `web/src/file-navigator/useFileNavigatorSelection.ts`, add `dropPendingFocus` to the object returned by the hook, beside `focusHint`.
2. In `web/src/file-navigator/use-file-navigator-row-events.ts`, call `selection.dropPendingFocus()` in `onRowMouseDown` after the `.files-rename-input` guard and before `keepSelection` is computed. Leave `pointer`, `replace`, `extend`, `selectSiblings`, `drag.onRowMouseDown`, and the selection branch untouched.
3. Add the hook test in `web/src/file-navigator/useFileNavigatorSelection.test.ts` under "holding a focus hint until its row arrives".
4. Add the tab test in `web/src/file-navigator/FileNavigatorTab.test.tsx` under "reveal focus", using a navigator label not used by another case and a revision above the module-level floor.

## Tests

- `useFileNavigatorSelection.test.ts`: render a pending focus hint for a `later.ts` row absent from `rows`, call `dropPendingFocus`, expect `focusHint` to read `dropped`, rerender with the row present, and expect nothing selected.
- `FileNavigatorTab.test.tsx` under "reveal focus": select `README.md`, render a pending focus hint for a missing `later.ts` with `autoFocus={false}`, mousedown the already-selected `README.md`, expect no acknowledgement while the row is absent, rerender with `later.ts` present, expect one `fileNavigatorRevealApplied` for the hint's revision, `README.md` still selected, and `later.ts` not selected.

## Verification

Run `$janissary/scripts/run.mjs check-diff` and `npx vitest run --project client web/src/file-navigator/FileNavigatorTab.test.tsx web/src/file-navigator/useFileNavigatorSelection.test.ts`.

## Out of scope

- Right-click, drag, or header-control drops; only the row's left-button mousedown changes.
- Any change to `pointer`, `replace`, `extend`, `selectSiblings`, the `keepSelection` selection logic, or `drag.onRowMouseDown`.
- Any server-side hint lifecycle change, timeout, or retry.
- Spec changes: `product/specs/editor-tab.md` already promises this click drops the pending selection.
