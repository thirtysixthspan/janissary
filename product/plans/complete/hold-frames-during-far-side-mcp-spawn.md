# Honor kill, input, resize and killAll that arrive while a far-side MCP spawn awaits its endpoint bind

**Complexity: 4/10** — 10 requirements over ~100 added lines in 1 edited file plus two new modules, 4 test scenarios (p=5.22)

## Goal

`RemoteProcesses.spawn` awaits `FarSideMcp.launch()` before it records the process entry for an MCP harness, so for the length of the bind there is no entry for that id. A `kill`, `input` or `resize` frame for the id, or a `killAll` from shutdown, that lands in that window finds nothing and is dropped, and the PTY is spawned once the bind settles anyway. A tab closed right after launch leaves a harness running on the remote host with nothing attached, early keystrokes vanish, and a second spawn with the same id slips past the duplicate check. This fix records the id as a pending spawn before the await, so every frame in the window either cancels the spawn or is applied to the process once it exists.

## Requirements

1. "record an id in a pending-spawn map before awaiting `endpoint.launch(frame.id)`": while an MCP spawn awaits its bind, its id counts as taken.
2. "treat a second spawn with that id as a duplicate": a second spawn frame with the same id during the wait starts nothing, and only one PTY is spawned for the id.
3. "have `kill(id)` ... mark a pending id cancelled so the continuation skips `spawnPty`": a kill during the wait means no PTY is spawned for that id once the bind settles.
4. A spawn cancelled by a kill is reported as that process's exit with code 1, through the existing spawn-failure path, and leaves no entry in the process table.
5. "have ... `killAll()` mark a pending id cancelled": a `killAll` during the wait means no PTY is spawned for any pending id.
6. "buffer `input` ... for a pending id and replay them once the entry exists": input that arrives during the wait reaches the process's writer, in arrival order, once it is spawned.
7. "buffer ... the latest `resize` for a pending id and replay them once the entry exists": the last resize that arrives during the wait is applied to the spawned process.
8. "check after the await that `this.mcp` is still the endpoint that was awaited, since `killAll` disposes it": a spawn whose endpoint was replaced or disposed during the wait starts no PTY.
9. "Restore the comment above `spawnPty`'s environment build so it states how the await is made safe": the comment says frames in the wait are held or cancel the spawn.
10. The spec describes that a kill or shutdown during the endpoint wait starts no harness, and that early input and resizes are applied once it starts.

## Design decisions

- The pending bookkeeping lives in a new `PendingSpawns` class in `src/remote/serve-pending-spawns.ts`, because `src/remote/serve-processes.ts` is already at 185 counted lines and the new state would push it past the 200-line limit. It owns one record per pending id: a cancelled flag, the input chunks in order, and the latest size.
- The new routing and the awaited continuation still take `src/remote/serve-processes.ts` past 200 counted lines, so the pipe-mode spawn (`spawnPipe`, the persistent shell started with plain pipes in a process group of its own) moves unchanged into a `spawnPipeProcess` function in `src/remote/serve-pipe-process.ts`. It is a self-contained unit that needs only the workspace, tokens, spawn name, `send` and `finish`, so it is the cohesive piece to move rather than anything on the MCP path.
- `RemoteProcesses.input`, `resize` and `kill` ask `PendingSpawns` first and return when it held the frame; otherwise they act on the live entry as today. `killAll` cancels every pending id before it ends the live entries.
- A cancelled spawn rejects its promise rather than resolving. `RemoteServer.spawn` already turns a rejected spawn into `{ type: 'exit', id, exitCode: 1 }` and skips `transcripts.follow` (Assumption 1), so the local tab closes the same way a refused bind closes it and no transcript is followed for a harness that never ran. This applies to `killAll` too, which matches how a live entry ended by `killAll` still reports an exit through `finish` (Assumption 2).
- The resize held during the wait is not emitted on the message bus when it arrives. It is replayed through `RemoteProcesses.resize` after the entry exists, so the bus event reaches the harness detection's screen, which is created with the entry and listens for resize events by id (Assumption 3).
- On replay the latest resize is applied before the buffered input, so keystrokes land in a terminal already at its final size.
- The endpoint identity check compares `this.mcp` with the endpoint the spawn awaited, after the pending record is ended, so a spawn outliving a `killAll` never uses a disposed endpoint even if a later spawn created a fresh one.

## Preserved behavior

1. A non-MCP PTY spawn records its entry synchronously, so input and resize reach it at once and the resize event is still emitted. It must not start holding frames for a spawn that does not await anything. Pinned by "routes input and resize through the owning entry and still emits the resize event" in `src/remote/serve-processes.test.ts`.
2. A real port collision is reported to the colliding harness without crashing the session. The bind failure must not be swallowed by the pending bookkeeping. Pinned by "reports a real port collision without crashing the session" in `src/remote/serve-mcp.test.ts`.
3. A later harness asking for a failed endpoint gets the stored reason and then an exit with code 1. The pending record must not keep that id taken after the failure. Pinned by "reports a failed shared MCP endpoint to a later harness before exiting it" in `src/remote/serve.test.ts`.
4. A spawn whose PTY will not start answers with that process's exit and the server keeps serving. It must not leave a stale entry behind. Pinned by "answers a spawn whose PTY will not start with that process's exit, and keeps serving" in `src/remote/serve.test.ts`.
5. A persistent shell is spawned in a process group of its own and ended together with that group. The move to its own module must not change how it is spawned or killed. Pinned by "spawns a persistent shell in a process group of its own" in `src/remote/serve-processes.test.ts`.
6. A persistent shell that cannot start ends with exit code 1 and sends one exit only. The move must not send a second exit. Pinned by "sends only one exit when the child also reports an exit after the error" in `src/remote/serve-processes.test.ts`.
7. The address reaches a harness only after the endpoint is listening. The spawn must not publish an address before the bind. Pinned by "withholds the MCP address until the endpoint is listening" in `src/remote/serve-mcp.test.ts`.

## Assumptions

1. A rejected spawn becomes an exit with code 1 and skips transcript following: `src/remote/serve.ts:220-224` "`} catch {`" ... "`this.emit({ type: 'exit', id: frame.id, exitCode: 1 });`" before "`this.transcripts.follow(frame.harness, this.provisioned?.dir)`".
2. `finish` sends an exit for every ended process, including those ended by `killAll`: `src/remote/serve-processes.ts:248` "`this.send({ type: 'exit', id, exitCode });`".
3. The detection screen listens for resize events on the message bus: `src/harness/screen.ts:42` "`messageBus.on('pty', ['data', 'exit', 'resize'], (event) => {`".
4. The entry is recorded only after the bind: `src/remote/serve-processes.ts:74-75` "`const mcp = await endpoint.launch(frame.id);`" then "`this.entries.set(frame.id, ...`".
5. `killAll` disposes the shared endpoint and clears it: `src/remote/serve-processes.ts:119-120` "`this.mcp?.dispose();`" then "`this.mcp = undefined;`".
6. The duplicate check runs only against live entries: `src/remote/serve-processes.ts:60` "`if (this.entries.has(frame.id)) return;`".

## Existing functionality

1. The spawn-failure-to-exit conversion: `src/remote/serve.ts:219` "`await this.provisioned?.processes.spawn(frame);`".
2. The live-entry input path used for replay: `src/remote/serve-processes.ts:85` "`input(id: string, data: string): void`".
3. The live-entry resize path that also emits the bus event, used for replay: `src/remote/serve-processes.ts:87` "`resize(id: string, cols: number, rows: number): void`".
4. The test fake that lets a test hold the `listening` event: `src/remote/serve-mcp.test.ts:24` "`on: vi.fn((event: string, handler: () => void) => { if (event === 'listening') handler(); })`".

## Implementation steps

1. Add `src/remote/serve-pending-spawns.ts` with a `PendingSpawns` class: `has(id)`, `begin(id)`, `input(id, data)` and `resize(id, cols, rows)` that return whether the id was pending, `cancel(id)` that marks a pending id cancelled and returns whether it was pending, `cancelAll()`, and `end(id)` that removes the record and returns the held input and latest size, or undefined when the spawn was cancelled. Build command: `$janissary/scripts/run.mjs check-diff`.
2. In `src/remote/serve-processes.ts`, hold a `PendingSpawns`. Make the duplicate check also refuse a pending id. For an MCP spawn, call `begin` before the await and move the awaited continuation into a private method that ends the record whether the launch resolves or rejects, rejects when the record was cancelled or `this.mcp` is no longer the awaited endpoint, and otherwise records the entry and replays the latest resize and then the input through `resize` and `input`. Route `input`, `resize` and `kill` through `PendingSpawns` first, and have `killAll` call `cancelAll`. Rewrite the comment above `spawnPty`'s environment build to say that frames arriving during the wait are held or cancel the spawn. Move the private `spawnPipe` method, with its comments, into `spawnPipeProcess` in the new `src/remote/serve-pipe-process.ts` and call it from `spawn`, keeping the file under the 200-line limit. Build command: `$janissary/scripts/run.mjs check-diff`.
3. Add the tests below, then update `product/specs/remote-server.md`. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The change is on the remote server's process table; the local tab sees the same exit it already sees for a refused spawn.

## Tests

All in `src/remote/serve-mcp.test.ts`, holding the `listening` event through the `httpMock.server.on` fake:

1. A kill during the hold, then release: the spawn rejects, `spawnPty` is never called, and `states()` is empty (Requirements 3, 4).
2. A `killAll` during the hold, then release: the spawn rejects and `spawnPty` is never called (Requirements 5, 8).
3. Input chunks and two resizes during the hold, then release: the writer receives the chunks in order and the resizer receives only the last size (Requirements 6, 7).
4. A second spawn with the same id during the hold: it returns without a promise, and after release `spawnPty` is called once (Requirements 1, 2).

## Out of scope

- `states()` does not list a pending spawn; an attach during the bind wait sees it only once the entry exists.
- `FarSideMcp.dispose()` called before the listener has bound does not close the listener that binds afterwards. `killAll` runs only from shutdown, which exits the process, so that listener does not outlive it; the endpoint's own lifecycle is left unchanged.
- No change to the local side, the wire protocol or the help pages.

## Verification

Run `$janissary/scripts/run.mjs check-diff`; it must be green.

Then, against a running app with a remote host configured, launch an MCP harness on that host with `harness opencode on <address>` and close its tab immediately, before the harness draws. On the remote host, `ps -ef | grep opencode` must show no harness process for that tab. Launch another and type into it as soon as the tab appears; the typed text must show up in the harness once it draws. A failure looks like a leftover `opencode` process on the remote after the close, or the first keystrokes missing from the harness.
