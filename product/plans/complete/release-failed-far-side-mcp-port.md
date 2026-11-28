# Release the far-side MCP port on bind failure

**Complexity: 2/10** — One production file, three requirements, and four test scenarios (p=4.04)

## Goal

Return the remote MCP listener's reservation to the shared pool as soon as its initial bind fails. Later harness launches still receive the reason their MCP endpoint could not start.

## Requirements

1. “Release the shared reservation from the pre-listen failure path” means the port becomes available to later guard allocations before endpoint disposal.
2. “Ensure dispose cannot release a later holder's reservation” means each endpoint releases its reservation at most once.
3. “Keep `launch()` as the only sender of the stored bind error” means each refused harness receives one reason before exit.

## Design decisions

- Let the far-side endpoint consume its own reservation exactly once. It owns the bind attempt and cleanup.
- Keep the initial bind outcome for later launch requests. A listener that bound successfully retains its reservation through disposal.

## Preserved behavior

1. Each harness refused by a failed endpoint receives an output frame containing the refusal before its exit. It never receives a second output for that same refusal. The existing test “reports a failed shared MCP endpoint to a later harness before exiting it” checks both harnesses.
2. A listening endpoint keeps its port unavailable to browser guards. A guard never receives that port while the endpoint owns it. The existing test “draws its port from the shared pool so a far-side browser guard cannot take it” checks this reservation.

## Assumptions

1. Reservation and OS bind are separate operations. `src/browser/e2e-ports.ts:9` states “Nothing is probed.”
2. A known port remains available for diagnostics after the reservation ends. `src/remote/serve-mcp.ts:41` stores `private readonly port`.

## Existing functionality

1. `src/browser/e2e-ports.ts:91` exposes `reserveReachablePort()` backed by the shared reservation set.
2. `src/remote/serve-mcp.ts:69` uses `await this.ready` to preserve the initial bind outcome for each launch.

## Implementation steps

1. In `src/remote/serve-mcp.ts`, make endpoint cleanup and initial bind failure share a one-time reservation release. Keep the stored failure and the launch-level output. Extend the real bind collision test in `src/remote/serve-mcp.test.ts` to confirm immediate reclamation and protection of the next owner. Run `$janissary/scripts/run.mjs check-diff`.
2. Clarify when a failed endpoint's port becomes available in `product/specs/remote-server.md`. Run `$janissary/scripts/run.mjs check-diff`.

## UI design

1. Each affected harness transcript shows the bind failure once, immediately before its exit.

## Tests

1. For requirements 1 and 2, verify that a deterministic shared-pool draw can reclaim the failed port before disposal. Keep the replacement reservation held while disposing the endpoint and confirm a third draw skips that port.
2. For requirement 3, preserve both the stored-failure and output-before-exit tests for the initial and subsequent harnesses.

## Out of scope

Changes to the browser port allocator, its range, or the remote endpoint's retry policy.

## Verification

1. Run `$janissary/scripts/run.mjs check-diff`.
2. Run `npm run test:server -- src/remote/serve-mcp.test.ts src/remote/serve.test.ts -t "port collision|failed shared MCP endpoint"`. The harness launch with an occupied port should report the bind error once before exiting. Before teardown, a shared-pool allocation should claim the released port, and disposing the failed endpoint should leave that claim in place.
