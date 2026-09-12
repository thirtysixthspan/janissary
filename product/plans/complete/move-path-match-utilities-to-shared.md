# Move the generic path and match utilities into the shared layer

## Complexity

4/10 — a mechanical move of four files plus import-specifier rewrites in fifteen consumer files; no behavior change, and no test mocks reference the modules by path.

## Goal

`web/src/rel-path.ts` and `web/src/fuzzy-match.ts` are framework-free pure utilities sitting at the app root, imported upward by the file-navigator, pickers, and editor features — generic shared code placed at the app-shell layer, against the one-way dependency flow (shared → feature → app). Move both into `web/src/shared/`.

## Approach

Move four files into `web/src/shared/` unchanged: `rel-path.ts`, `rel-path.test.ts`, `fuzzy-match.ts`, `fuzzy-match.test.ts`. `fuzzy-match.ts` imports `./rel-path` — both move together, so that specifier stays.

Retarget the import specifiers:

- file-navigator (nine files): `../rel-path` → `../shared/rel-path` — `FileNavigatorOverlays.tsx`, `useFileNavigatorPaste.ts`, `FileNavigatorOpenerOverlay.tsx`, `useFileNavigatorSelection.ts`, `file-navigator-drag.ts`, `file-navigator-new-file.ts`, `file-search-match.ts`, `file-navigator-rename.ts`, `useFileNavigatorMoveOperations.ts`
- pickers: `useQuickOpen.ts`, `QuickOpen.tsx`, `picker-overlay-view.ts`, `QuickOpen.test.tsx` change `../fuzzy-match` → `../shared/fuzzy-match`; `QuickOpen.tsx` also `../rel-path` → `../shared/rel-path`
- editor: `useEditorFind.ts`, `EditorFind.tsx`, `EditorFind.test.tsx` change `../fuzzy-match` → `../shared/fuzzy-match`

## Implementation

1. `git mv` the four files to `web/src/shared/`.
2. Retarget the fifteen consumer files.
3. Run `./scripts/run.mjs check-diff` after the move and again after the rewrites.

## Tests

No new tests — a pure move. `web/src/shared/rel-path.test.ts` and `web/src/shared/fuzzy-match.test.ts` keep passing with their own relative specifiers intact; the consumer suites stay green with retargeted imports.

## Out of scope

- Any behavior change to the utilities.
- Moving other root modules imported upward from `web/src/shared/`.
