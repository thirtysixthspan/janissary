# docs(remote): correct the remote-server spec's statement of the HTTP servers remote-serve starts

**Complexity: 1/10** — no production lines or files, 5 requirements, no test scenarios (p=2.84)

## Goal

The `janus remote-serve [<project-dir>]` section of `product/specs/remote-server.md` says "the only HTTP server it starts is a loopback MCP endpoint for a harness that asks for one". That's wrong. The same process also starts an e2e browser protocol guard, a WebSocket server on its own loopback port, for every harness it spawns with `-b`/`--browser`. The sentence is the spec's statement of the remote host's network surface, so someone re-deriving the far side's threat model from it would miss one listener per `-b` harness. This plan rewrites that clause so it names both kinds of listener and keeps the loopback-only claim that holds for each.

## Requirements

1. The section's first paragraph no longer says the MCP endpoint is the only HTTP server `remote-serve` starts, per the issue "the only HTTP server it starts is a loopback MCP endpoint for a harness that asks for one".
2. The paragraph says the only HTTP servers it starts listen on loopback, per the proposal "replace the 'only HTTP server' clause with one saying the only HTTP servers it starts listen on loopback".
3. The paragraph names the e2e browser guard started for each harness launched with the browser, per the proposal "the e2e browser guard for each harness launched with the browser".
4. The paragraph names the MCP endpoint for the harnesses that asked for one, per the proposal "the MCP endpoint for harnesses that asked for one".
5. The rest of the section stays verbatim, per the proposal "Leave the capability-surface paragraph and the rest of the section as they are".

## Design decisions

- Only `product/specs/remote-server.md` changes. Both listeners already bind loopback and already start on the paths the corrected clause names (Assumptions 1, 2 and 3), and the proposal says "No code or test changes".
- The guard is called the e2e browser's protocol guard and the flag is written `-b`/`--browser`, because that is how the same spec already names both a few sections earlier (Assumption 4).
- The MCP endpoint is described as the one endpoint shared by the harnesses that asked for one, not one per harness, because the far side claims exactly one endpoint per remote process (Assumption 5). The current clause's "a harness that asks for one" reads as one per harness, and the rewrite would otherwise carry that over.
- The rest of the sentence, "It takes no instance lock, opens no window, and writes no log file", stays as written; only the clause after the semicolon is replaced.

## Preserved behavior

1. A `-b` spawn on the far side builds its own protocol guard there and starts no browser until a client connects. The spec correction must not change `RemoteProcesses.spawnPty`, so a `-b` spawn must not stop starting a guard or start a browser eagerly. Pinned by `builds its own guard on the far side and starts no browser` in `src/remote/serve-processes-browser-lazy.test.ts`.
2. A spawn without the flag starts no guard and names no browser variables. The correction must not change that, so a plain spawn must not gain a listener. Pinned by `starts nothing at all without the flag, and names no browser in the environment` in `src/remote/serve-processes-browser-lazy.test.ts`.
3. A spawn without MCP creates no far-side endpoint. The correction must not change that, so a harness that didn't ask must not cause an MCP listener. Pinned by `creates no endpoint and relays nothing for a spawn without mcp` in `src/remote/serve-mcp.test.ts`.

## Assumptions

1. The far-side spawn passes the launch frame's browser flag into the shared spawn environment: `src/remote/serve-processes.ts:166` "`browser: frame.browser ?? false`".
2. A `-b` spawn environment starts the lazy e2e browser server, whose guard listens from launch: `src/harness/scratch-dir.ts:61` "`const browser = startLazyE2EBrowserServer({`", which reaches `src/browser/e2e-server.ts:203` "`session.guard = startE2EGuard({`", and the guard binds loopback at `src/browser/e2e-guard.ts:155` "`new WebSocketServer({ host: E2E_LOOPBACK_HOST, port: options.port, path: options.wsPath })`" with `src/browser/e2e-loopback.ts:13` "`export const E2E_LOOPBACK_HOST = '127.0.0.1';`".
3. The far-side MCP endpoint is an HTTP server bound to loopback: `src/remote/serve-mcp.ts:63` "`this.server = createServer((request, response) => {`" and `src/remote/serve-mcp.ts:79` "`this.server.listen(this.port, LOOPBACK);`".
4. The spec already calls the far side's guard a protocol guard started for `-b`/`--browser`: `product/specs/remote-server.md:195` "whether the tab was started with `-b`/`--browser`, and the remote acts on that by starting its own" and `product/specs/remote-server.md:196` "protocol guard on its own host".
5. One endpoint serves every MCP harness of a remote process: `src/remote/serve-processes.ts:76` "`const endpoint = this.mcp ??= new FarSideMcp((out) => {`", and `product/specs/remote-server.md:955` "Exactly one endpoint is claimed per remote process."

## Existing functionality

1. The clause being corrected: `product/specs/remote-server.md:918` "only HTTP server it starts is a loopback MCP endpoint for a harness that asks for one."

## Implementation steps

1. In the first paragraph of the `janus remote-serve [<project-dir>]` section of `product/specs/remote-server.md`, replace the clause "the only HTTP server it starts is a loopback MCP endpoint for a harness that asks for one" with one saying the only HTTP servers it starts listen on loopback: the e2e browser's protocol guard for each harness launched with `-b`/`--browser`, and the one MCP endpoint shared by the harnesses that asked for one. Leave the rest of that paragraph, the capability-surface paragraph and every other part of the section as they are. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Promote this plan to `product/plans/complete/` and remove the resolved entry from `product/backlog/pull-request.md`, leaving the other entries unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The change is to a spec file only, and no user-visible surface changes.

## Tests

This plan changes no application behavior and introduces no code, so it adds no tests. The tests named under Preserved behavior already pin the listeners the corrected clause describes.

## Out of scope

- Any change to `RemoteProcesses`, `harnessSpawnEnv`, `startLazyE2EBrowserServer`, `startE2EGuard` or `FarSideMcp`.
- The confined browser's own private listener behind the guard. It runs in a child process started on the first connect, not in `remote-serve` itself, and `product/specs/sandbox.md` already describes it.
- The capability-surface paragraph and the "MCP on the far side" subsection.
- The other entries in `product/backlog/pull-request.md`.
- `documentation/user-documentation/` and `documentation/developer-documentation/`.
- The PR description and title.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then read the first paragraph of the `janus remote-serve [<project-dir>]` section in `product/specs/remote-server.md` against `RemoteProcesses.spawnPty` in `src/remote/serve-processes.ts`, `harnessSpawnEnv` in `src/harness/scratch-dir.ts` and the `FarSideMcp` constructor in `src/remote/serve-mcp.ts`. The paragraph should say the only HTTP servers `remote-serve` starts listen on loopback, and name both the protocol guard for each `-b`/`--browser` harness and the one shared MCP endpoint. "It takes no instance lock, opens no window, and writes no log file" and the sentences after the clause should match the previous text word for word. Finding "the only HTTP server it starts is" still in the paragraph, a description that leaves out either listener, or any change to the capability-surface paragraph means the correction was wrong.
