# Plugin shared contract guards

## Goal

Stop client-executed plugin contracts from importing runtime guards through the server plugin API surface.

## Design

Keep runtime imports out of the client-executed contracts: each owns its hand-written object guard, and the conversations contract owns its small model-pair guard. The sessions contract retains its pre-existing type-only protocol aliases; TypeScript erases those imports before bundling. The server-only SQL intent module owns its object guard locally too, because the server plugin import boundary forbids reaching into host leaf modules. Its dock parser continues through the published plugin API.

This avoids changing the forbidden binding guideline or lint configuration. The server decoder plan also excludes plugin `shared.ts` contracts, so the two plans do not leave conflicting targets.

## Verification

Completed with local hand-written guards to preserve the binding import-free contract. `./scripts/run.mjs check-diff` passed, and `npm run build:web` succeeded. Inspection of all twelve plugin JS chunks found no server plugin API markers.
