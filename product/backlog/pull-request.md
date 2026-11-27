<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the technical debt in the new server-level collision test, which derives its forced MCP port from an OS-assigned ephemeral port that can fall outside the endpoint's legal port band.

Existing Issue: The new case in src/remote/serve.test.ts sets `cryptoMock.port` from a `blocker.listen(0)` address, but `claimPort()` in src/remote/serve-mcp.ts wraps any value outside `[FIRST_PORT, FIRST_PORT + PORT_COUNT)` through a modulo, so the endpoint can bind a different port than the blocker and the intended collision never occurs. Severity: 4/10

Existing Risk: 3/10 - When the OS hands out a port above the endpoint's band, the test silently stops exercising the failure path it was added to verify and fails with a spurious timeout instead, weakening confidence in the reported fix.

Proposal Risk: 1/10 - Deriving the forced port from a real endpoint's bound URL keeps it inside the accepted band deterministically, so the collision and the later-harness report reliably occur.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "make the new server-level MCP collision test derive its forced port from a real endpoint". In src/remote/serve.test.ts, replace the `blocker.listen(0)` / `address.port` source for `cryptoMock.port` with the pattern the real-collision fixture in src/remote/serve-mcp.test.ts already uses: construct a FarSideMcp, read the port from its `launch().url`, dispose it, then bind the blocker to that port. That guarantees the value falls inside the band `claimPort()` accepts, so the second harness spawn reliably hits the stored bind failure and receives the reason before its exit. Leave the production changes in src/remote/serve-mcp.ts and src/remote/serve-processes.ts and the other assertions in the case untouched. Note that the current setup can pass or fail depending on the OS-assigned port, so one green run does not prove the path is covered.
