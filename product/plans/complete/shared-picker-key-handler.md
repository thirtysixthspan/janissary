# Move the reusable picker key handler into shared

**Complexity: 3/10** — a small pure-function move across the keyboard handler module, overlay contract module, and focused tests, with no behavior or contract change.

## Goal

`web/src/overlay-plugins/api.ts` imports `handlePickerKey` from the shared layer rather than from app-shell keyboard handling. Existing app consumers can continue importing it from `web/src/keyboard-handlers.ts`.

## Implementation

Move the unchanged `handlePickerKey` implementation to `web/src/shared/picker-keyboard.ts`. Re-export it from `web/src/keyboard-handlers.ts` to preserve current imports, and import it directly from the shared module in `web/src/overlay-plugins/api.ts`. Keep the overlay plugin API and all key behavior unchanged.

Update `web/src/keyboard-handlers.test.ts` to import the handler from the shared module, retaining its assertions for clamped movement, command execution, closing, and unhandled keys. The existing overlay plugin tests continue to cover the contract integration.

## Verification

Run `./scripts/run.mjs check-diff` after the implementation.

## Spec and documentation

No user-visible behavior or extension contract changes, so no spec or documentation update is needed.
