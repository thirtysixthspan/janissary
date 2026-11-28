# Share one loopback MCP listener between the local server and the far-side endpoint

**Complexity: 4/10** — 7 requirements, 2 edited files, ~35 added lines (p=4.93)

## Goal

The local MCP server and the far-side `remote-serve` endpoint each build their own `node:http` server with the same `/mcp` path filter, the same 404 answer, the same guard wiring, and their own copies of the loopback host, the path and the URL format. Those two copies are one tool's security boundary, so a later tightening that lands in one copy leaves the other endpoint serving the old rules, and nothing would notice if either lost its path filter. This change moves the request boundary into one shared module that both endpoints call, and pins its path refusal with a test, while each caller keeps its own bind lifecycle.

## Requirements

1. "Share one loopback MCP listener between the local server and the far-side endpoint": the local manager's listener and the far-side endpoint's listener are built by one shared factory.
2. "pin its path refusal with a test": a request for a path other than `/mcp` is answered `404` with the body `Not Found`.
3. A request for a path other than `/mcp` never reaches the guard, so it gets `404` even when it carries no token.
4. A request for `/mcp` with a query string reaches the guard.
5. An unauthenticated `/mcp` request is answered `401` and never reaches the MCP handler.
6. The shared module formats the endpoint URL as `http://127.0.0.1:<port>/mcp`, and both endpoints publish that URL.
7. Both endpoints bind to the shared loopback host, `127.0.0.1`.

## Design decisions

- A new module `src/mcp/listener.ts` owns the loopback host constant, the server factory (handler plus token in, `node:http` `Server` out, with the path filter and guard applied), and the URL formatter, as the backlog proposal names.
- The factory only builds the server; it never calls `listen`. The local manager's awaited `listen`/`error` promise and the far side's `ready` promise settled by `listening`/`error` stay with each caller, because the two lifecycles differ and the far-side collision tests depend on its own (see Assumption 3).
- The new module imports `createServer` from `node:http` directly, so the `node:http` mock in `src/remote/serve-mcp.test.ts` still replaces the server the far side gets (Assumption 2).
- The path constant `/mcp` stays private to the new module; callers only need the URL formatter.
- The new test drives the factory's server by emitting a `request` event with fake request and response objects, mirroring the fakes in `src/mcp/guard.test.ts`, and wraps the real `guard` in a spy to observe whether a request reached it.

## Preserved behavior

1. A request with a missing or wrong bearer token is refused with `401` and the handler is not called; this must not start passing unauthenticated requests through. Pinned by `guard > answers 401 for a missing or wrong bearer token (%s)` in `src/mcp/guard.test.ts`.
2. The local server reports `running` with URL `http://127.0.0.1:<port>/mcp` after it starts; the URL must not change shape. Pinned by the running-status cases in `src/mcp/manager.test.ts`.
3. The local server still fails to start, with a notification, on a taken port; the bind error must not be swallowed by the shared factory. Pinned by `src/mcp/manager-port.test.ts`.
4. The far side binds to `127.0.0.1` and withholds its MCP address until the endpoint is listening; it must not publish a URL before `listening`. Pinned by `the far-side MCP endpoint > relays a question as mcp-call and settles it when mcp-result arrives` in `src/remote/serve-mcp.test.ts`.
5. A real far-side port collision is reported over the session without crashing it; the bind failure message must still name `127.0.0.1:<port>`. Pinned by `reports a real port collision without crashing the session` in `src/remote/serve-mcp.test.ts`.

## Assumptions

1. Both copies of the request handler are identical today: `src/mcp/manager.ts:79` `if (request.url?.split('?', 1)[0] !== MCP_PATH)` and `src/remote/serve-mcp.ts:64` `if (request.url?.split('?', 1)[0] !== MCP_PATH)`, each followed by `response.writeHead(404)` and `response.end('Not Found')`.
2. The far-side tests replace `createServer` for every importer of `node:http`: `src/remote/serve-mcp.test.ts:33` `vi.mock('node:http', async (importOriginal) =>`.
3. The far side's bind lifecycle is driven by `listening` and `error` events: `src/remote/serve-mcp.ts:71` `this.ready = new Promise<void>((resolve, reject) =>` and `src/remote/serve-mcp.ts:79` `this.server.listen(this.port, LOOPBACK);`.
4. The local bind lifecycle is an awaited promise around `listen`: `src/mcp/manager.ts:86` `await new Promise<void>((resolve, reject) =>`.
5. The guard answers 401 synchronously before any await: `src/mcp/guard.ts:19` `if (!tokenMatches(token, bearerToken(request)))`.

## Existing functionality

1. The request guard: `src/mcp/guard.ts:12` `export function guard(handler: NodeHandler, token: string): NodeHandler`.
2. The adapter from an MCP HTTP handler to a Node handler: `src/mcp/manager.ts:4` `import { toNodeHandler } from '@modelcontextprotocol/node';`.
3. The handler type both callers hold: `src/remote/serve-mcp.ts:4` `import type { McpHttpHandler } from '@modelcontextprotocol/server';`.
4. Fake request and response objects for guard tests: `src/mcp/guard.test.ts:7` `function request(headers: Record<string, string>, method = 'POST'): IncomingMessage`.

## Implementation steps

1. Add `src/mcp/listener.ts` exporting `MCP_HOST` (`127.0.0.1`), `createMcpServer(handler: McpHttpHandler, token: string): Server`, which builds the `node:http` server with the `/mcp` path filter, the `404 Not Found` answer, and `guard(toNodeHandler(handler), token)`, and `mcpUrl(port: number): string`. Build command: `$janissary/scripts/run.mjs check-diff`.
2. In `src/mcp/manager.ts`, have `listen` call `createMcpServer` and keep its awaited bind promise; replace the local `LOOPBACK` and `MCP_PATH` constants with `MCP_HOST` and `mcpUrl`; drop the now-unused `createServer`, `toNodeHandler`, and `guard` imports. Build command: `$janissary/scripts/run.mjs check-diff`.
3. In `src/remote/serve-mcp.ts`, have the `FarSideMcp` constructor call `createMcpServer` and keep its `ready` promise; use `MCP_HOST` in the bind and failure message and `mcpUrl` in `launch`; remove the local `LOOPBACK` and `MCP_PATH` constants and the unused imports. Build command: `$janissary/scripts/run.mjs check-diff`.
4. Add `src/mcp/listener.test.ts` per the Tests section. Build command: `$janissary/scripts/run.mjs check-diff`.
5. Add one sentence to `product/specs/mcp-server.md` stating that the server answers only `/mcp`, that any other path gets `404 Not Found` before its token is checked, and that the remote endpoint applies the same request rules. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The change adds no surface the user sees or operates; the `mcp` command output and the harness launch environment are unchanged.

## Tests

New `src/mcp/listener.test.ts`, colocated, mirroring `src/mcp/guard.test.ts`'s fakes:

1. Requirements 2 and 3: for paths such as `/`, `/other`, `/mcp/` and `/mcpx`, an unauthenticated request gets `404` with body `Not Found`, and the guarded handler is not called.
2. Requirement 4: `/mcp?session=1` reaches the guarded handler.
3. Requirement 5: an unauthenticated `/mcp` request gets `401` and the MCP handler's `fetch` is never called.
4. Requirements 6 and 7: `mcpUrl(4321)` is `http://127.0.0.1:4321/mcp` and `MCP_HOST` is `127.0.0.1`.

Requirement 1 is covered by the existing suites passing unchanged against the shared factory: `src/mcp/guard.test.ts`, `src/mcp/manager.test.ts`, `src/mcp/manager-port.test.ts`, `src/remote/serve-mcp.test.ts` and `src/remote/serve.test.ts`.

## Out of scope

- Folding either bind lifecycle into the shared factory.
- Any new request rule such as a Host check or body limit.
- Changing the guard, the handler factory, or the URL either endpoint publishes.
- User and developer documentation, owned by `update-documentation.md`.

## Verification

Run `$janissary/scripts/run.mjs check-diff`; it must pass lint, typecheck, and the server tests including the new `src/mcp/listener.test.ts`.

Then start Janissary, run `mcp` in a tab, and read the printed `url:` (for example `http://127.0.0.1:<port>/mcp`). Run `curl -i http://127.0.0.1:<port>/other`; it must answer `404 Not Found`. Run `curl -i -X POST http://127.0.0.1:<port>/mcp`; it must answer `401 Unauthorized`. A `401` for `/other`, or anything but `401` for the unauthenticated `/mcp`, means the shared path filter or guard is not wired in.
