# Use protocol remote-session types in the plugin contract

**Complexity: 3/10** — the protocol already owns these wire types. The plugin contract and connection plug can reference them directly without changing runtime behavior.

## Goal

Use the protocol's remote session kind, state, and action types in the sessions plugin contract and the connection plug, removing their duplicate type declarations while keeping runtime validation exhaustive.

## Implementation steps

1. Re-export `RemoteSessionState` from `src/protocol/sessions.js` in `src/protocol.ts`, since the protocol boundary did not expose it yet. Add type-only re-exports for `RemoteSessionKind`, `RemoteSessionState`, and `RemoteSessionAction` from `src/protocol.js` in `src/plugins/api.ts`.
2. In `src/plugins/sessions/shared.ts`, alias `SessionRowKind`, `SessionRowState`, and `SessionRowAction` to those published types. Type the `KINDS`, `STATES`, and `ACTIONS` records with their corresponding aliases so every protocol member is required.
3. In `web/src/shared/ConnectionPlug.tsx`, use `RemoteSessionState` from `@shared/protocol` for `ConnectionPlugState`, preserving the existing labels and public alias. Leave the three-state subset in `RemoteSessionButton.tsx` unchanged.
4. Remove only this item from the ready section of `product/backlog/technical-debt.md`.

## Tests

The existing `src/plugins/sessions/shared.test.ts` pins the plugin row shape to `RemoteSessionView` and validates session rows; its type and record checks will ensure protocol members stay aligned. `web/src/shared/ConnectionPlug.test.tsx` verifies the plug's labels for every state. Run `./scripts/run.mjs check-diff`.

## Specs and documentation

No functional spec update is needed because the accepted session values and their presentation do not change. No help or public documentation describes these internal TypeScript declarations, so no documentation update is needed.

## Out of scope

- Changing remote-session behavior, row decoding rules, or plug labels.
- Expanding the three-state subset used by `RemoteSessionButton.tsx`.
- Editing any other technical-debt entry or resolving another item.
