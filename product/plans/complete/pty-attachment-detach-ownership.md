# Make PTY detach release only its own attachment

Complexity 2/10 — one conditional in the existing detach closure, one regression test, and a concise spec update. The current last-attach-wins routing and output buffering remain unchanged.

## Goal

Detaching a superseded PTY output attachment must not remove the handler that replaced it.

## Approach

Keep the per-PTY handler map and current replacement behavior. When an attachment is released, remove its PTY entry only if that entry still points to the same `onData` callback the attachment registered. This makes a stale release a no-op while preserving ordinary detach and reattach behavior.

## Implementation steps

1. In `web/src/shared/ws/ws.ts`, make the function returned by `attachPty` compare the current handler with its captured `onData` before deleting the entry.
2. In `web/src/shared/ws/ws.test.ts`, attach handler A, then handler B for the same PTY, detach A, and verify subsequent output reaches B and not A.

## Tests

- Add one regression test to `web/src/shared/ws/ws.test.ts` for a superseded handler detaching without silencing its replacement.
- Run the existing shell terminal tests unchanged to verify late attachment cleanup still works.
- Run `$janissary/scripts/run.mjs check-diff` after the implementation, test, spec, and backlog/plan changes.

## Spec and documentation

- Update `product/specs/websocket-rpc.md` to state that the latest attachment receives a PTY's output and releasing an older attachment does not interrupt it.
- No help or public user-documentation page describes this attachment-release behavior, so no public documentation change is planned.

## Out of scope

- Changing last-attach-wins routing, buffered-output replay, PTY authorization, output delivery during reconnection, or shell terminal lifecycle behavior.
