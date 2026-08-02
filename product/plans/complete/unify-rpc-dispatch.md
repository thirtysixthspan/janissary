# Unify RPC dispatch through the controller façade

Complexity: 6/10

## Goal

Make `src/message-handler.ts` and its specialized handler use one dispatch rule: every accepted client RPC enters through a method on `Controller`. Preserve all existing reply timing, result shapes, side effects, and silent handling of unknown methods.

## Approach

Add controller façade methods for the RPCs that currently reach into managers or feature modules directly. Keep feature implementations in their existing modules, but make the controller the only entry point from the WebSocket dispatch layer. Split the deferred and file-navigator routing details into focused handler modules where that keeps the main dispatcher within the file-size limit.

## Implementation steps

1. Extract the existing completion assembly into a focused controller helper so the façade can grow without violating the 200-line source limit.
2. Add typed `Controller` façade methods for state initialization, focus and pane movement, questions and schedules, transcript/layout/project-file operations, editor persona operations, editor connection closing, and the remaining file-navigator operations.
3. Update `message-handler.ts` and `message-handler-file-navigator.ts` so every dispatched method calls the corresponding controller method, while preserving specialized asynchronous and fire-and-forget replies.
4. Remove obsolete direct feature imports and routing comments, remove the now-unused completion helper on `Controller`, and extract any cohesive dispatcher section needed to keep source files under the 200-line limit.
5. Update the message-handler routing tests to assert the controller façade is used for former manager/module bypasses, including deferred replies and file-navigator results.

## Tests

- Run `./scripts/run.mjs check-diff` after each implementation step.
- Extend `src/message-handler.test.ts` to cover the controller façade for direct-manager, direct-feature, deferred, and fire-and-forget routes while retaining the existing reply assertions.

## Specs and documentation

No user-visible behavior, RPC method, parameter, or reply changes are planned. `product/specs/websocket-rpc.md`, `help.md`, and `documentation/user-documentation/` should remain unchanged unless implementation reveals a documented behavior mismatch.

## Out of scope

- Changing the `ClientMessage` wire contract or any RPC result.
- Reworking feature modules or manager ownership beyond adding controller entry points.
- Changing user-facing help or documentation for this internal dispatch refactor.
