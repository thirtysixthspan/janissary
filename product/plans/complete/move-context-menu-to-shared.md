# Move the context-menu primitive into the shared layer

## Complexity

3/10 — one file plus its test move, and four importers retarget; no behavior change.

## Goal

`web/src/file-navigator/FileNavigatorOverlays.tsx` and `web/src/file-navigator/file-navigator-menu-items.ts` import `ContextMenu`/`ContextMenuItem` from `../ContextMenu` at the app root — a feature reaching upward into the app-shell layer, against the one-way dependency flow (shared → feature → app). The `web/src/context-menu/` feature directory that owns the app's default menu imports the same primitive the same way. Move the generic primitive to `web/src/shared/ContextMenu.tsx` so both consumers import it from the shared layer.

## Approach

Move `web/src/ContextMenu.tsx` and its colocated test `web/src/ContextMenu.test.tsx` to `web/src/shared/` unchanged apart from relative import specifiers. Four files retarget:

- `web/src/file-navigator/FileNavigatorOverlays.tsx`: `../ContextMenu` → `../shared/ContextMenu`
- `web/src/file-navigator/file-navigator-menu-items.ts`: `../ContextMenu` → `../shared/ContextMenu`
- `web/src/context-menu/DefaultContextMenu.tsx`: `../ContextMenu` → `../shared/ContextMenu`
- `web/src/context-menu/default-menu-target.ts`: `../ContextMenu` → `../shared/ContextMenu`

`web/src/ContextMenu.test.tsx` imports from `./ContextMenu` and keeps that specifier once both files move together. `web/src/context-menu/` stays exactly where it is — it holds the app's default right-click menu, which is a feature; only the generic primitive moves.

## Implementation

1. `git mv` the two files to `web/src/shared/`.
2. Retarget the four importers.
3. Run `./scripts/run.mjs check-diff` after the move and again after the rewrites.

## Tests

No new tests — a pure move. `web/src/shared/ContextMenu.test.tsx` pins the menu's rendering and `contextMenuPosition`, and `web/src/context-menu/DefaultContextMenu.test.tsx` renders the default menu through the primitive; both must keep passing untouched apart from the import path.

## Out of scope

- Moving the `web/src/context-menu/` feature directory.
- Any behavior change to the primitive.
