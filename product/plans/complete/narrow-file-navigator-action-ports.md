# Define narrow file navigator action ports

Complexity: 5/10

## Goal

Keep the file navigator's action factory independent of React hooks and make the callbacks it uses explicit and testable.

## Approach

Replace hook return types in `navigator-menu-actions.ts` with small structural ports for selection, opening, paste/duplicate, deletion, rename, row double-click, and commit. Keep ports beside the factory and preserve the callback signatures the production caller already satisfies.

## Implementation steps

1. Replace the seven hook type imports and `ReturnType` fields with explicit narrow ports in `web/src/file-navigator/file/navigator-menu-actions.ts`.
2. Update the direct factory consumer in `FileNavigatorOverlays.test.tsx` to provide complete narrow fakes instead of asserted partial inputs.
3. Add `web/src/file-navigator/file/navigator-menu-actions.test.ts` coverage for selection-versus-clicked-row paths, multi-open fan-out, and accepting only the expected new-directory reply.
4. Promote this plan to complete and remove only this item from `product/backlog/technical-debt.md`.

## Tests

- Assert selection-scoped delete/commit paths and clicked-row fallback.
- Assert multi-open dispatches every selected path through the opener.
- Assert the pending directory is set only when the server reply matches the expected target.
- Preserve rendered commit-selection cases in `FileNavigatorOverlays.test.tsx` and tab interactions in `FileNavigatorTab.test.tsx`.
- Run `./scripts/run.mjs check-diff` after implementation, tests, and backlog edits.

## Out of scope

- Changing navigator actions, hook contracts, row selection behavior, or menu presentation.
- Refactoring hook-to-hook dependencies or moving the action ports to a shared module.
