# feat: run a far-side MCP endpoint that relays calls to the local process

**Complexity: 5/10** — ~180 added lines, 2 edited files plus 1 new module, 7 requirements, 5 scenarios (p=5.33)

## Goal

Give a connected remote session its own MCP endpoint on the remote host, inside that session's `janus remote-serve`, and make its `question` tool relay each call over the session's existing connection to the local Janissary. The far side mints its own token, so the local server's persisted token never crosses the link. This subplan delivers a working call/result round trip; the grace window for a lost link lands next.

Source: `./product/plans/complete/janissary-mcp-server.md`. Depends on `janissary-mcp-server-1-mcp-core.md`, `janissary-mcp-server-7-harness-spawn-env.md` and `janissary-mcp-server-11-remote-frames.md`.

## Requirements

1. While a remote session is connected, an MCP server is available to the harnesses it runs on the remote machine — user answer: "what we want is for an establish connection to a remote machine, where a harness is being run, for a mcp server to be available."
2. A remote harness's MCP server runs on the remote machine, inside that session's `janus remote-serve` — user answer: "the mcp server could be remote".
3. The remote MCP server passes each command back to the local Janissary process for execution, over the session's existing connection — user answer: "but pass commands back to the local machine for execution." Shared with `janissary-mcp-server-14-local-relay.md`, which executes the call locally.
4. A remote harness's question runs in the local Janissary process, and its answer returns to the remote harness — user answer: "the question executes locally and the mcp server responds to the remote harness." Shared with `janissary-mcp-server-14-local-relay.md`.
5. The remote MCP server's connection and authentication details reach the harness in its far-side spawn environment — feature text: "the server should expose its connection and authentication details to all harnesses".
6. The remote MCP endpoint requires a bearer token that `janus remote-serve` mints for itself on the far side — user answer: "Far side mints its own".
7. The local server's persisted token never leaves the local machine — user answer: "The local server's persisted token never leaves this machine".

## Design decisions

- A remote harness's MCP server is a far-side endpoint inside `janus remote-serve`, serving the same `question` tool over the same guard and handler factory on the remote host's loopback. Its tool callback does not answer locally: it relays each call to the local Janissary as a new `mcp-call` request frame on the session's existing framed protocol and answers when the correlated `mcp-result` frame arrives.
- The far side mints its own token with `makeToken`, listens on `127.0.0.1:0`, and keeps both listener and token for the process's life so they survive a detach. No SSH port forward is used, so no remote port or socket has to be named before ssh connects.
- The endpoint is started lazily on the first `spawn` with `mcp: true`, so a session with no MCP harness pays nothing. `serve-processes.ts` passes `{ url, token }` into `harnessSpawnEnv`, completing the far-side copy of the environment.
- The relaying executor keeps a pending map keyed by a fresh `call` id; this subplan covers the link-present path only. Holding calls during a lost link, the grace timer and re-sends are added in `janissary-mcp-server-13-far-side-relay-grace.md` on the same map.
- The launch command is built locally and shipped in the `spawn` frame's `command`; the launch fragment names only environment variables, so it works on the far side unchanged.

## Preserved behavior

None found.

## Assumptions

1. A remote harness's launch command is built locally and shipped in the `spawn` frame, while its environment is built on the far side — `src/harness/tab-spawn.ts:85` `const command = buildHarnessCommand(name, model, effort);` and `src/remote/serve-processes.ts:109` `harnessSpawnEnv({`.
2. `mcp-call` and `mcp-result` frames and their base64 fields already exist — `src/remote/protocol-frames.ts` and `src/remote/base64-fields.ts`, added by `janissary-mcp-server-11-remote-frames.md`.
3. The guard and handler factory are reusable on a different host — `src/mcp/guard.ts` and `src/mcp/handler.ts`, added by `janissary-mcp-server-1-mcp-core.md`.
4. Token minting exists on every host — `src/security.ts:5` `export function makeToken()`.
5. Far-side client frames are dispatched in one switch — `src/remote/serve.ts:121` `switch (frame.type) {`.
6. A deliberate Detach drops the transport without telling the peer anything — `product/specs/remote-server.md:559` "drops the transport without telling the peer anything".

## Existing functionality

1. Far-side process spawning and environment construction — `src/remote/serve-processes.ts:100` `private spawnPty(frame: Extract<ClientFrame, { type: 'spawn' }>): ProcessResources`.
2. Harness spawn environment built on the host the harness runs on — `src/harness/scratch-dir.ts:42` `harnessSpawnEnv`.
3. The SDK handler factory, HTTP guard and executor contract — `src/mcp/handler.ts`, `src/mcp/guard.ts` and `src/mcp/tools.ts`, added by `janissary-mcp-server-1-mcp-core.md`.
4. Correlated request/reply frames over the live channel — `src/remote/protocol-frames.ts:307` `type: 'acp-tool-request'` and `:192` `type: 'acp-tool-result'`.
5. Far-side inbound frame dispatch — `src/remote/serve.ts:121` `switch (frame.type) {`.
6. The loopback listener pattern — `src/mcp/manager.ts`, added by `janissary-mcp-server-5-local-server-manager.md`.

## Implementation steps

1. Create `src/remote/serve-mcp.ts` with a lazily-created far-side endpoint object per `remote-serve` process. On the first `spawn` with `mcp: true`, it mints its own token with `makeToken`, starts a `node:http` listener on `127.0.0.1:0`, and mounts the guard and handler from `src/mcp/` with a relaying executor that implements the contract from `src/mcp/tools.ts`. Keep listener and token for the process's life. Build and check with `$janissary/scripts/run.mjs check-diff`.
2. In the same module, implement the relaying executor's link-present path: mint a fresh `call` id, store a pending entry keyed by it, send `mcp-call` with base64 JSON arguments while a link exists, and settle the entry when a matching `mcp-result` arrives with its `{ text, isError }`. A caller abort removes its entry and sends nothing further. Add a `case 'mcp-result'` to the far-side inbound dispatch at `src/remote/serve.ts:121` that forwards the frame to this pending map. Leave link-loss behavior for the next subplan. Build and check with `$janissary/scripts/run.mjs check-diff`.
3. In `src/remote/serve-processes.ts:100`, obtain `{ url, token }` from that endpoint when the spawn frame carries `mcp: true` and pass it into `harnessSpawnEnv` (`src/remote/serve-processes.ts:109`) alongside `browser`. A spawn without `mcp` gains nothing. Update `product/specs/remote-server.md` with the far-side endpoint, its self-minted token and the fact that the local token never leaves the local machine. Build and check with `$janissary/scripts/run.mjs check-diff`.

Every touched file stays under the 200-line `max-lines` limit; `serve-mcp.ts` is a new focused module. Relative imports in `src/` carry the `.js` extension per NodeNext.

## UI design

1. No new UI surface: the remote harness sees the same question panel on its local tab as any harness, driven by the relay in `janissary-mcp-server-14-local-relay.md`.

## Tests

- `src/remote/serve-mcp.test.ts`, with a fake send and fake timers: a call is relayed as `mcp-call` and settles on `mcp-result`; the far-side token differs from any value in the spawn frame; no endpoint is created for a spawn without `mcp` (requirements 1–7). Leave grace-window cases to `janissary-mcp-server-13-far-side-relay-grace.md`.

## Out of scope

- The grace window, held and re-sent calls and detached-session error text: `janissary-mcp-server-13-far-side-relay-grace.md`.
- The local side's `mcp-call` handler: `janissary-mcp-server-14-local-relay.md`.
- Sending `mcp: true` on the spawn frame: `janissary-mcp-server-14-local-relay.md`.
- Any use of the local server's persisted token on the far side.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then read `src/remote/serve-mcp.ts`, `src/remote/serve-processes.ts` and `src/remote/serve.ts`: confirm the endpoint mints its own token, binds loopback on an ephemeral port, is created only for an `mcp` spawn, that its `{ url, token }` reaches `harnessSpawnEnv`, and that `mcp-result` settles the matching pending call. A failure is a frame carrying the local token or a call that never settles.
