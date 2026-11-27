# Publish a far-side MCP address only after its port binds

**Complexity: 5/10** — ~28 added lines across 3 production files, 11 requirements and 8 test scenarios, with no new modules or types (p=5.46).

## Goal

A remote harness is handed its far-side MCP URL before the loopback port has bound, because `listen()`
settles on a later tick while `launch()` reads the recorded failure synchronously. The first harness
that collides with an occupied port therefore starts with a dead address and only sees the reason in
a later output frame. Make the bind outcome observable as a promise, await it in `launch()`, and build
the harness environment only from a resolved launch so a failed bind is a failed spawn instead.

## Requirements

1. "expose the bind outcome as a promise resolved on 'listening' and rejected on 'error'".
2. "have launch() await it so a failed bind throws before any URL is returned".
3. "keep the 'error' listener that records the reason before listen()".
4. "keep the stored reason so later harnesses still get it through output frames".
5. "create or launch the endpoint before harnessSpawnEnv builds the environment".
6. "a failed bind never places an unbound URL in a harness's variables".
7. "leaving RemoteServer.spawn's existing exit-code-1 branch to report it".
8. "assert no address is published on the first collision without first awaiting the output frame".
9. "keep the later-harness test".
10. "keep src/remote/serve.test.ts's shared-endpoint collision test passing".
11. "Rewrite the description sentence only after the code makes it true."

## Design decisions

- One bind-outcome promise belongs to each `FarSideMcp` and is settled by the server's `'listening'`
  and `'error'` events (`src/remote/serve-mcp.ts:84-88`). The constructor cannot await, so a promise
  is the only way `launch()` can observe an event that arrives after construction returns.
- The `'error'` listener still records `failure` and sends its original output frame before it
  rejects. `launch()` re-sends that stored reason to its own caller's id when the promise rejects, so
  a later harness gets a report naming its own tab rather than only the first harness's report.
- Endpoint creation and `launch()` move out of `spawnPty` into `RemoteProcesses.spawn`; `spawnPty`
  receives a resolved `McpLaunch`, which is the only value that may reach `harnessSpawnEnv`.
- Spawns without MCP keep their synchronous path and return no promise. Only an MCP spawn returns a
  promise, awaited inside `RemoteServer.spawn`'s existing try/catch; this preserves the process-table
  insert timing that the current spawn tests rely on and avoids a new failure-reporting path.
- The PR description is corrected only after the code and tests are green, and only in the one
  sentence the work item names.

## Preserved behavior

1. A later harness that asks for a failed endpoint still receives the stored reason in an output
   frame naming its own tab before it is refused; it is never closed silently. Representative test:
   `reports the stored bind failure to a later harness that asks for the failed endpoint`
   (`src/remote/serve-mcp.test.ts`).
2. A spawn whose PTY refuses to start still answers as that process's exit code 1 while the server
   keeps serving; the failure never escapes as an uncaught exception. Representative test: `answers
   a spawn whose PTY will not start with that process's exit, and keeps serving`
   (`src/remote/serve.test.ts`).
3. A spawn without MCP still enters the process table synchronously and creates no endpoint or
   promise. Representative test: `answers one entry per live process, carrying its program, mode, and
   harness or agent name` (`src/remote/serve-processes.test.ts`).
4. A relayed question still travels through the real handler and settles on `mcp-result`.
   Representative test: `relays a question as mcp-call and settles it when mcp-result arrives`
   (`src/remote/serve-mcp.test.ts`).

## Assumptions

1. `Server.listen` reports `EADDRINUSE` on a later tick, not inside the constructor: "calls listen()
   asynchronously and launch() checks the recorded failure synchronously"
   (`product/backlog/pull-request.md:7`).
2. One endpoint serves a whole remote session — `this.mcp ??= new FarSideMcp(...)`
   (`src/remote/serve-processes.ts:116`) — so every caller awaits the same bind outcome.
3. `RemoteServer.spawn` already emits `{ type: 'exit', id: frame.id, exitCode: 1 }` on failure
   (`src/remote/serve.ts:218-222`), so no new frame or reporting path is needed.
4. The mocked `node:http` server returns immediately from `listen()`
   (`src/remote/serve-mcp.test.ts:18-21`), so its `'listening'` handler must be invoked at
   registration for mocked spawns to settle.

## Existing functionality

1. The real handler, guard and token are installed at construction by
   `guard(toNodeHandler(createHandler(this.relay)), this.token)` (`src/remote/serve-mcp.ts:74-75`).
2. The existing `'error'` listener records the failure text and sends it as an `output` frame
   (`src/remote/serve-mcp.ts:84-87`).
3. `harnessSpawnEnv` merges `JANISSARY_TAB`, `JANISSARY_MCP_URL` and `JANISSARY_MCP_TOKEN` into the
   harness environment (`src/harness/scratch-dir.ts:42-59`).
4. `RemoteServer.spawn` reports a synchronous spawn failure as exit code 1
   (`src/remote/serve.ts:213-225`).
5. `Promise.withResolvers` and a real `node:http` server are already used to exercise a collision
   (`src/remote/serve-mcp.test.ts:157-187`).

## Implementation steps

1. Change the three production modules together so the tree type-checks at this checkpoint. In
   `src/remote/serve-mcp.ts`, add a per-endpoint promise settled by `'listening'` and `'error'`,
   attach a no-op rejection handler so an endpoint nobody launches cannot raise an unhandled
   rejection, and make `launch()` await it before returning a URL, re-sending the stored reason to
   its caller on failure. In `src/remote/serve-processes.ts`, create the endpoint and await
   `launch()` in `spawn()` before invoking `spawnPty`, pass the resolved `McpLaunch` into
   `spawnPty`, and leave the non-MCP path untouched. In `src/remote/serve.ts`, make `spawn()` async,
   await the table's spawn inside its existing try/catch, and fire it from `dispatch` without a second
   reporting branch. Adapt the test call sites that now await `launch()` in the same step so the
   checkpoint is green. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Add the new publish-timing test and update the four collision/token tests listed under Tests.
   Build command: `$janissary/scripts/run.mjs check-diff`.
3. Update the existing far-side collision paragraph of `product/specs/remote-server.md` to state
   that the address is withheld until the port binds and that the failed spawn is reported as exit
   code 1. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. This is a server-side launch-ordering change: no command, flag, key binding, panel or other
user interface surface is added or altered.

## Tests

- New in `src/remote/serve-mcp.test.ts`: a launch held before `'listening'` publishes no URL, then
  publishes one once the event fires (requirement 2's observable form).
- Updated in `src/remote/serve-mcp.test.ts`: the real-collision test awaits `launch()` on the first
  collision without first awaiting the output frame and asserts the failed launch publishes no
  address (requirement 8); the later-harness test awaits both launches and keeps its exact two-frame
  assertion (requirement 9); the token test flushes the bind microtask before reading the spawn
  environment (requirement 6).
- Updated in `src/remote/serve.test.ts`: the shared-endpoint collision test awaits both spawns and
  keeps the first harness's bind report, the second harness's stored reason and exit code 1, and an
  unaffected server (requirement 10).

## Out of scope

- Changing the one-endpoint-per-session lifetime, port reservation, detach grace window, or the
  `mcp-call`/`mcp-result` relay frames.
- Changing the local MCP manager's own collision handling or its persisted port and token.
- Editing `help/` or either documentation tree; no help page describes this launch ordering.
- Working the other two pull-request backlog entries (remote cancellation, non-object arguments).
- Adding or updating change-set statistics anywhere in the PR description.

## Verification

`$janissary/scripts/run.mjs check-diff` is the build gate. Manual check: on a host running
`janus remote-serve`, hold a loopback port in the far-side ephemeral band with another process and
launch an MCP-enabled remote harness. Its tab shows the `MCP endpoint could not bind` output and the
process closes with exit code 1; no harness on that host is started with a `JANISSARY_MCP_URL` for
the held port. Launch a second MCP-enabled harness on the same session: it receives its own stored
reason and closes with exit code 1, while the remote session keeps serving further frames. A failure
is a tab that starts with a URL to the blocked port, or a second harness that closes without an
explanation.
