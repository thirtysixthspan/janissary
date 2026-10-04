# Bind file navigator mutation replies to their RPC methods

Complexity: 6/10 (threshold: 7).

## Goal

Make the method-specific result shapes for move, paste, rename, undo, and redo RPCs checked by TypeScript on both the server and client, without changing their wire format or behavior.

## Approach

Define one result map beside the file-navigator RPC union, using the existing result types and a named rename result. Type the six server dispatcher handlers against the map, and add a small client request adapter that infers its result from the RPC method. Keep generic transport behavior and all non-mutation RPCs unchanged.

## Implementation steps

1. Add the six-method result map and the named rename result in `src/protocol/file-navigator.ts`, then export them through the shared `src/protocol.ts` contract. Add a mapped handler table in `src/message/file-navigator.ts` whose return types are checked against those results. Run `./scripts/run.mjs check-diff`.
2. Add a colocated file-navigator request adapter and migrate move, paste, rename, undo, and redo calls in `useFileNavigatorMoveOperations.ts`, `useFileNavigatorPaste.ts`, and `useFileNavigatorRename.ts` to use method-inferred replies. Add compile-time assertions for reply inference and an incompatible server result. Run `./scripts/run.mjs check-diff`.
3. Preserve and run the existing dispatcher, controller, move/history, paste, and rename behavior tests. The documented conflict, failure, and retry behavior remains unchanged, so no functional spec, help, or public-documentation edits are needed. Remove this item from the development backlog, move this plan to complete, and run `./scripts/run.mjs check-diff`.
4. Ship through `ai/tasks/workspace/merge-change-to-master.md` and confirm the ready and development sections are empty on master.

## Tests

Use compile-time assertions to verify method-specific result inference and reject an incompatible server handler result. Keep the existing server dispatch and controller result tests, plus client move/history retry, paste conflict and clipboard behavior, and rename interaction tests passing.

## Out of scope

Changing RPC wire encoding, runtime payload validation, generic request transport behavior, result contracts for other RPC families, and user-visible conflict or failure behavior.
