# fix(remote): report the MCP bind failure to every harness refused on a failed far-side endpoint

**Complexity: 3/10** — ~6 added lines in 2 production files, 7 requirements, 4 scenarios (p=4.53)

## Goal

A far-side MCP endpoint is one per remote session, and a bind collision leaves it failed for the rest of that session. Today only the harness that created the endpoint hears why the bind failed; every later harness that asks for MCP is refused with no explanation in its own tab and closes on exit code 1. The reason is already stored and already sent to the creator, so this fix reuses it: each refused harness gets the stored reason in its own tab before the refusal, while the original colliding harness's report stays exactly as it is.

## Requirements

1. "give launch() an optional requesting process id that defaults to the constructor's id": `launch()` accepts an optional id which, when omitted, is the id passed to the `FarSideMcp` constructor.
2. "when failure is set send an output frame addressed to that id carrying the stored failure string before throwing": with the endpoint failed, `launch()` emits an `output` frame whose `id` is the requesting id and whose `data` is the stored failure text, then throws.
3. "pass frame.id to launch() at the shared-endpoint call in spawnPty": the shared endpoint's `launch()` call in `spawnPty` supplies the spawning harness's `frame.id`.
4. "Every refused harness receives the stored reason in its own tab before the exit": a harness spawned after the endpoint failed sees the reason as an output frame addressed to its own id before its exit frame.
5. "the original report on the colliding harness's tab stays unchanged": the bind-time report to the endpoint creator's id keeps its current destination, text, and timing.
6. "add a case that drives a real collision through a FarSideMcp instance and asserts that a later launch emits the output reason before throwing": a new `serve-mcp.test.ts` case forces a real bind collision and checks the later launch's output frame and its throw.
7. "in src/remote/serve.test.ts assert that the spawn catch turns that throw into an exit code 1 for the second harness": a new `serve.test.ts` case checks the second harness's spawn ends in an `exit` frame with code 1.

## Design decisions

- The bind error string is stored once on the endpoint and reused verbatim; no second message is composed for later harnesses.
- The optional id defaults to the constructor id so an existing bare `launch()` call on a failed endpoint still reports to the creator, keeping the current collision case valid (Assumption 2).
- The output frame goes through the endpoint's existing `send` callback, so it crosses the same session transport as every other terminal frame (Assumption 1).
- `spawnPty` supplies `frame.id` because the endpoint was constructed with the first harness's id but the refusal belongs to whichever harness asked this time (Assumption 3).
- The server's spawn catch is left as is: it already turns a spawn throw into an exit frame for that frame's id (Assumption 4).

## Preserved behavior

1. The bind-time report still names the endpoint creator's id and carries the bind error. It must not be replaced by the later-launch report or dropped. Pinned by `reports a real port collision without crashing the session` in `src/remote/serve-mcp.test.ts`.
2. The five named tests in `src/remote/serve-mcp.test.ts` (the real collision case and the four mocked cases) stay as they are. They must not be rewritten to accommodate the new behavior, and they keep pinning the loopback bind, guard, token, relay and cancellation behavior. Pinned by `relays a question as mcp-call and settles it when mcp-result arrives` in `src/remote/serve-mcp.test.ts`.
3. A spawn that throws still answers with that process's exit code 1 and leaves the session serving. No exit frame may be replaced by a session-wide failure. Pinned by `answers a spawn whose PTY will not start with that process's exit, and keeps serving` in `src/remote/serve.test.ts`.

## Assumptions

1. `src/remote/serve-mcp.ts:60` `private readonly send: (frame: ServerFrame) => void` is the session's framed transport, already used at `src/remote/serve-mcp.ts:75` to send the bind report.
2. `src/remote/serve-mcp.ts:57` `private failure?: string;` is set once by the `server.on('error')` handler at `src/remote/serve-mcp.ts:73-76` and read by `launch()` at `src/remote/serve-mcp.ts:81`.
3. `src/remote/serve-processes.ts:115` `(this.mcp ??= new FarSideMcp(this.send, frame.id)).launch()` constructs the endpoint with the first harness's id but launches it for every later spawn with MCP.
4. `src/remote/serve.ts:216-221` catches a throw from `this.provisioned?.processes.spawn(frame)` and emits `{ type: 'exit', id: frame.id, exitCode: 1 }`.
5. `src/remote/serve-mcp.test.ts:137-167` already drives a real `EADDRINUSE` collision with a probe endpoint, a fixed `randomInt` and a blocker server, so the same setup can produce a failed instance for a later launch.

## Existing functionality

1. The `ServerFrame` output frame and the `send` callback already carry terminal text to a named tab: `src/remote/serve-mcp.ts:75` `this.send({ type: 'output', id: this.id, data: \`${this.failure}\n\` });`.
2. The spawn catch already translates a refused spawn into that process's exit: `src/remote/serve.ts:219` `this.emit({ type: 'exit', id: frame.id, exitCode: 1 });`.
3. The real-collision fixture in `src/remote/serve-mcp.test.ts:141-153` (`probe`, `cryptoMock.randomInt`, `blocker`, `collisionSend`) can be reused for the new case.
4. The server-level spawn-failure fixture in `src/remote/serve.test.ts:547-560` (provision, mocked `spawnPty`, frame assertion) is the pattern for the new server case.

## Implementation steps

1. In `src/remote/serve-mcp.ts`, extend `launch()` with an optional requesting id that defaults to `this.id`. In the branch where `failure` is set, send an `output` frame carrying the stored failure string to that id through `this.send` before throwing the existing error. Leave `constructor`, the `server.on('error')` handler, `result`, `dispose`, and `relay` unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.
2. In `src/remote/serve-processes.ts`, change only the shared-endpoint `launch()` call inside `spawnPty` to pass `frame.id`, so the refusal is addressed to the harness that asked rather than to the endpoint creator. Build command: `$janissary/scripts/run.mjs check-diff`.
3. Add the two tests named in the Tests section, without editing the existing collision case or the four mocked cases. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. A harness tab launched with MCP on a session whose far-side endpoint has already failed gains one output line naming the bind failure before it closes.
2. The first, colliding harness tab keeps the single bind-failure line it receives today, with no second line added to it.
3. No command, flag, or key binding changes.

## Tests

In `src/remote/serve-mcp.test.ts`:

1. Requirement 6: a new case drives a real collision through a `FarSideMcp`, then calls `launch('r2')` and asserts an `output` frame addressed to `r2` carrying the stored reason arrives before the throw.

In `src/remote/serve.test.ts`:

2. Requirement 7: a new case drives a failed shared endpoint, spawns a second harness with MCP, and asserts the frames contain the reason addressed to the second harness followed by an `exit` frame with code 1 for that harness.

## Out of scope

- Grace-window behavior and any timing or disposal logic around it.
- The server's spawn catch, exit semantics, and the first harness's bind-time report.
- Rewriting the existing collision case or the four mocked cases in `src/remote/serve-mcp.test.ts`.
- Help pages and the `documentation/user-documentation/` and `documentation/developer-documentation/` trees.

## Verification

1. `$janissary/scripts/run.mjs check-diff` passes.
2. Manual: on a remote host, hold the far-side MCP port with a second process, open a harness tab with MCP enabled, then open a second harness tab with MCP enabled on the same session. The first tab shows the bind-failure line as it does today; the second tab shows the same reason in its own terminal before closing, and the session keeps serving other tabs. A failure looks like the second tab closing silently with exit code 1 and no reason in its own output.
