<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the notifications spec's description of the withdrawn-question event, which says it only covers questions on background tabs.

Existing Issue: The `question-withdrawn` entry in the notifications spec opens with "a question asked by an agent in a background tab is withdrawn before it is answered", while the MCP executor records the withdrawal for an abandoned question on any tab, active or not, and the same entry goes on to say the line is recorded even while that tab is active. Severity: 2/10

Existing Risk: 2/10 - The entry states two contradictory rules for when the line appears, and a later change that follows its first sentence could add a background-only check the implementation never had, silently dropping withdrawal notices for the tab the user is looking at.

Proposal Risk: 1/10 - Only the entry's opening sentence changes; a wording that still misstates the rule would show as a mismatch against the executor tests.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "correct the notifications spec's question-withdrawn entry to cover every tab". `createLocalExecutor` in `src/mcp/executor.ts` calls `notify(managers, 'question-withdrawn', label)` from its abort handler whichever tab is active, and `EXPLICIT_EVENTS` in `src/notifications/index.ts` exempts the event from focus suppression. In the event list of `product/specs/notifications.md`, reword the first sentence of the `question-withdrawn` entry to say it is recorded when the caller of a pending MCP question, local or relayed from a remote harness, abandons it before it is answered, on whichever tab it was asked; keep the rest of the entry, including the answered-or-cancelled exception, the no-toggle rule and the `warning` cue, unchanged. No code or test changes: "withdraws an aborted question, shows the next queued question, and records one notification" and "does not notify when the signal aborts after the question was answered" in `src/mcp/executor.test.ts` pin the behavior the sentence describes.


* Correct the remote-server spec's claim that the MCP endpoint is the only HTTP server `janus remote-serve` starts.

Existing Issue: The `janus remote-serve` section of the remote-server spec now says "the only HTTP server it starts is a loopback MCP endpoint for a harness that asks for one", but the same process also starts a loopback e2e browser guard, a WebSocket server listening on its own port, for every harness it spawns with the browser flag set. Severity: 2/10

Existing Risk: 3/10 - The sentence is the spec's statement of the remote host's network surface, so anyone re-deriving the far side's threat model from it misses one listener per `-b` harness.

Proposal Risk: 1/10 - Only the sentence changes; a wording that still omitted a listener would show against the far-side spawn code it names.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "correct the remote-server spec's statement of the HTTP servers remote-serve starts". `RemoteProcesses.spawnPty` in `src/remote/serve-processes.ts` calls `harnessSpawnEnv` in `src/harness/scratch-dir.ts` with `browser: frame.browser`, which starts `startLazyE2EBrowserServer` in `src/browser/e2e-server.ts` and, through `startE2EGuard` in `src/browser/e2e-guard.ts`, a `WebSocketServer` on a loopback guard port, alongside the `FarSideMcp` listener in `src/remote/serve-mcp.ts`. In the first paragraph of the `janus remote-serve [<project-dir>]` section of `product/specs/remote-server.md`, replace the "only HTTP server" clause with one saying the only HTTP servers it starts listen on loopback: the e2e browser guard for each harness launched with the browser and the MCP endpoint for harnesses that asked for one. Leave the capability-surface paragraph and the rest of the section as they are. No code or test changes. Verify by reading the paragraph against those two spawn paths.


* Declare the zod package the MCP tool registry imports, instead of relying on the copy the MCP SDK happens to hoist.

Existing Issue: The MCP tool registry imports `z` from `zod` to build the `question` input schema, but `zod` appears nowhere in `package.json`, so the import resolves only because npm hoists the copy that `@modelcontextprotocol/server` and `@modelcontextprotocol/core` depend on. Severity: 4/10

Existing Risk: 5/10 - An install layout that nests that copy instead of hoisting it, such as a later dependency that needs another zod major or a pruned production install, makes the import fail when `createManagers` loads the MCP manager, which stops the whole app from starting rather than just the MCP server, and `npm run knip` in the human gate already reports it as an unlisted dependency.

Proposal Risk: 2/10 - The import then resolves from a declared, pinned dependency; what remains is keeping that pin inside the `^4.2.0` range the SDK accepts, where a mismatch would show as a second nested copy in the lockfile rather than a startup failure.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "declare zod as a direct dependency for the MCP tool registry". `src/mcp/tools.ts` imports `z` from `zod` to define `questionInputSchema`, which `src/mcp/handler.ts` hands to the SDK, while `package.json` lists no `zod` entry; `package-lock.json` resolves the hoisted `node_modules/zod` at 4.6.7, required at `^4.2.0` by `@modelcontextprotocol/server` and `@modelcontextprotocol/core`. Run `$janissary/scripts/run.mjs check-malicious-package zod@4.6.7` first and stop on a blocked or quarantined result. Then add `zod` to `dependencies` in `package.json` at exactly the locked 4.6.7, matching how the two MCP packages are pinned, and refresh `package-lock.json` so its root package lists the dependency without moving any resolved version. Do not change `src/mcp/tools.ts`. The existing `src/mcp/handler.test.ts` cases and "serves a tools/list call that returns exactly question" in `src/mcp/manager.test.ts` exercise the schema and must keep passing unchanged; confirm with `npm run knip` that `zod` is no longer reported as unlisted.


* Share one loopback MCP listener between the local server and the far-side endpoint, and pin its path refusal with a test.

Existing Issue: The local manager's `listen` and the far-side endpoint's constructor each build their own `node:http` server with the same `/mcp` path filter, the same 404 answer, the same `guard(toNodeHandler(handler), token)` wiring and their own copies of the loopback host, the path and the URL format, and no test exercises the 404 branch in either copy. Severity: 3/10

Existing Risk: 4/10 - The two halves of one tool's security boundary can drift apart: a later tightening such as a Host check, a body limit or a different path rule lands in one copy and leaves the other endpoint serving the old rules, and an accidental loss of the path filter in either goes unnoticed because no test pins it.

Proposal Risk: 2/10 - One factory and one test then define the request boundary for both endpoints; the remaining hazard is the two different bind lifecycles, which have to stay with each caller rather than be folded into the shared factory.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "share one loopback MCP listener between the local server and the far-side endpoint". In `src/mcp/manager.ts`, `listen` creates a server whose request handler answers 404 for any path other than `MCP_PATH` and otherwise calls `guard(toNodeHandler(handler), token)`; the `FarSideMcp` constructor in `src/remote/serve-mcp.ts` repeats that handler, redeclares `LOOPBACK` and `MCP_PATH`, and both files build the `http://<host>:<port>/mcp` URL themselves. Add a new module such as `src/mcp/listener.ts` exporting the loopback host, a function that turns an `McpHttpHandler` and a token into the `node:http` server with the path filter and the guard, and a URL formatter, and have `listen` and the `FarSideMcp` constructor call it. Keep each bind lifecycle where it is: `listen`'s awaited `listen`/`error` promise and the far side's `ready` promise settled by `listening`/`error`, which "withholds the MCP address until the endpoint is listening" and the collision tests in `src/remote/serve-mcp.test.ts` depend on. Import `createServer` from `node:http` in the new module so the `node:http` mock in `src/remote/serve-mcp.test.ts` still applies. Add a colocated `src/mcp/listener.test.ts` asserting that a non-`/mcp` path gets 404 without reaching the guard, that `/mcp` with a query string reaches the guard, and that an unauthenticated `/mcp` request gets 401. `src/mcp/guard.test.ts`, `src/mcp/manager.test.ts`, `src/mcp/manager-port.test.ts`, `src/remote/serve-mcp.test.ts` and `src/remote/serve.test.ts` must keep passing unchanged.
