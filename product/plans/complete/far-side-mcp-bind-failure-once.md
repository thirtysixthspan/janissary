# fix(mcp): report a far-side MCP bind failure once to the harness that collided

**Complexity: 2/10** — one production file with a one-line removal, 4 requirements, 3 test scenarios (p=3.52)

## Goal

When the far side's MCP endpoint cannot bind its loopback port, the first harness that asked for it sees `MCP endpoint could not bind ...` twice in its tab. The constructor's `error` listener sends the line to the constructing harness's id, and `launch(frame.id)` then sends the same stored reason to that same id again. This fix makes `launch` the only sender, so every refused harness, the first one included, gets the reason exactly once before its exit-code-1 refusal.

## Requirements

1. "Report a far-side MCP bind failure once to the harness that collided, not twice": the colliding harness receives exactly one `output` frame carrying the bind failure.
2. "every refused harness still receives the reason before `RemoteServer.spawn` emits exit code 1": a later harness asking for the failed endpoint receives exactly one `output` frame with the stored reason.
3. The stored reason still reaches each refused harness before its `exit` frame with exit code 1.
4. "assert exactly one `output` frame for `r1` and one for `r2`": the collision tests in `src/remote/serve-mcp.test.ts` and `src/remote/serve.test.ts` assert those exact counts.

## Design decisions

- Remove the `output` send from the constructor's `error` listener and keep `launch(id)` as the single sender of the stored reason. The backlog proposal offers this or tracking which ids were told; removing the send is smaller and leaves no per-id state, and it is safe because every caller that constructs the endpoint calls `launch` for that same id at once (Assumption 2).
- The listener still records `this.failure` and rejects `ready`, so `launch` keeps its message and its rejection.
- Update the spec sentence "the first, colliding harness's report is unchanged" to say every refused harness, the colliding one included, is told exactly once.

## Preserved behavior

1. A port collision is contained: `launch` rejects with `MCP endpoint could not bind`, and a later endpoint can bind the same port after `dispose`. It must not crash the session or leave the port reserved. Pinned by "reports a real port collision without crashing the session" in `src/remote/serve-mcp.test.ts`.
2. A later harness asking for a failed shared endpoint is told the reason and exits with code 1 while the server keeps running. It must not exit the remote server. Pinned by "reports a failed shared MCP endpoint to a later harness before exiting it" in `src/remote/serve.test.ts`.

## Assumptions

1. The duplicate comes from two sends: `src/remote/serve-mcp.ts:74` `this.send({ type: 'output', id: this.id, data: \`${this.failure}\n\` });` in the `error` listener, and `src/remote/serve-mcp.ts:87` `this.send({ type: 'output', id, data: \`${this.failure}\n\` });` in `launch`.
2. The only production constructor of `FarSideMcp` passes `frame.id` and immediately calls `launch(frame.id)`: `src/remote/serve-processes.ts:76` `new FarSideMcp((out) => {` with `frame.id`, then `src/remote/serve-processes.ts:89` `mcp = await endpoint.launch(frame.id);`.
3. `RemoteServer.spawn` answers a rejected launch with the refusal: `src/remote/serve.ts:221` `this.emit({ type: 'exit', id: frame.id, exitCode: 1 });`.

## Existing functionality

1. `launch` already replays the stored reason to whichever id asks: `src/remote/serve-mcp.ts:87` in `launch`'s `catch`.
2. The collision test harness forces the drawn port and blocks it with a real server: `src/remote/serve-mcp.test.ts` "reports a real port collision without crashing the session", using `cryptoMock.randomInt` and `actual.createServer()`.

## Implementation steps

1. In `src/remote/serve-mcp.ts`, delete the `this.send({ type: 'output', ... })` line from the constructor's `error` listener, keeping the `this.failure` assignment and the `reject`. Build command: `$janissary/scripts/run.mjs check-diff`.
2. In `src/remote/serve-mcp.test.ts`, tighten "reports a real port collision without crashing the session" to assert `collisionSend` received exactly one `output` frame for `r1`. Rework "reports the stored bind failure to a later harness that asks for the failed endpoint" so it no longer waits on a constructor-sent frame: launch `r1`, expect the rejection, launch `r2`, expect the rejection, then assert the frames are exactly one `output` for `r1` followed by one for `r2`. Build command: `$janissary/scripts/run.mjs check-diff`.
3. In `src/remote/serve.test.ts`, tighten "reports a failed shared MCP endpoint to a later harness before exiting it" to assert exactly one bind-failure `output` frame for `r1` and one for `r2`, each followed by its exit-code-1 `exit` frame. Build command: `$janissary/scripts/run.mjs check-diff`.
4. Update the MCP on the far side section of `product/specs/remote-server.md`. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. The remote harness tab that collided shows the `MCP endpoint could not bind to 127.0.0.1:<port>: <reason>` line once instead of twice before the tab closes with exit code 1. No other surface changes.

## Tests

- Requirement 1: "reports a real port collision without crashing the session" in `src/remote/serve-mcp.test.ts` asserts one `output` frame for `r1`.
- Requirements 1 and 2: "reports the stored bind failure to a later harness that asks for the failed endpoint" in `src/remote/serve-mcp.test.ts` asserts the frames are exactly `[r1 output, r2 output]`.
- Requirements 2 and 3: "reports a failed shared MCP endpoint to a later harness before exiting it" in `src/remote/serve.test.ts` asserts one `output` per id and that each precedes that id's exit-code-1 `exit` frame.

## Out of scope

- The wording of the bind-failure message.
- The other entries in `product/backlog/pull-request.md`.
- The PR description, which this entry does not name.

## Verification

Run `$janissary/scripts/run.mjs check-diff` and confirm it passes.

Manual check: on a remote host, hold the port the far side's MCP endpoint will draw (or run the `serve-mcp.test.ts` collision case with `--reporter verbose`), then open a remote harness tab with MCP on. The tab should print `MCP endpoint could not bind to 127.0.0.1:<port>: ... EADDRINUSE ...` exactly once and close with exit code 1. Open a second MCP harness on the same session; it should print the same line once and close the same way. Seeing the line twice in the first tab means the fix did not take.
