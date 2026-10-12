# Await remote ACP process teardown

Complexity: 8/10 (complexity override requested)

## Goal

Only acknowledge remote ACP resources as released after the owned child process exit has been observed, and keep remote workspace cleanup ordered behind ACP teardown.

## Approach

Extend `AcpSession` with an idempotent awaitable shutdown that signals the child and resolves on its `exit` event. `RemoteAcp.close` shares one bounded shutdown attempt across concurrent requests and replies positively only when it resolves; timeout or shutdown failure replies with `released: false`, which the existing local release path reports as a cleanup warning. Remote server shutdown awaits ACP disposal before removing the workspace.

## Implementation steps

1. Add an awaitable, idempotent ACP shutdown while preserving `kill()` and existing prompt, permission, and exit-reporting behavior.
2. Make remote ACP close and disposal await shutdown, bound close acknowledgment, and prevent concurrent close requests from releasing twice.
3. Await remote ACP teardown before workspace removal during server shutdown, preserving a bounded failure path.
4. Add tests for observed-exit-before-ack ordering, timeout and negative acknowledgment, concurrent close, and local warning propagation.
5. Update the ACP and remote-server behavior specs, and check existing user documentation for any cleanup claim that needs correction.

## Tests

- `src/acp/index.test.ts` proves shutdown resolves after the real child exits and is idempotent.
- `src/remote/serve-acp.test.ts` proves no positive acknowledgment precedes shutdown completion, timeout is negative, and concurrent close requests share one teardown.
- `src/remote/acp-session.test.ts` proves concurrent release waits for the acknowledgment and timeout produces `false`.
- Remote server shutdown tests prove workspace removal follows ACP teardown.
- Run `./scripts/run.mjs check-diff` after each implementation step and after specs are updated.

## Specs / docs

Update `product/specs/acp.md` and `product/specs/remote-server.md`. Update public documentation only if an existing page describes the changed cleanup behavior.

## Out of scope

Do not change ACP prompt or permission behavior, local ACP consumers, remote protocol frame shapes, or unrelated backlog entries.
