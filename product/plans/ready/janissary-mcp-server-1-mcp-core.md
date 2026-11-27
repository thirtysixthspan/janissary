# feat: add the local MCP core, tool registry and guarded SDK handler

**Complexity: 5/10** — ~185 added lines, 3 files, 7 requirements, 9 scenarios (p=5.67)

## Goal

Make the official MCP SDK v2 available to the application and build the protocol layer that the local server and the remote relay will mount: a one-entry tool registry, the `question` tool definition with its exact validation errors, a handler factory that turns the registry into an SDK server, and an HTTP guard that enforces Origin and bearer-token rules. Nothing listens on a socket yet, so this change is self-contained and green on its own.

Source: `./product/plans/complete/janissary-mcp-server.md`. Depends on no earlier subplan.

## Requirements

1. The official TypeScript SDK v2 packages are available to the application — user answer: "Adopt SDK v2".
2. Every MCP request requires the server's bearer token — user answer: "requests require auth token".
3. One server-wide token authenticates every harness — user answer: "One server-wide token for every harness."
4. The server advertises exactly one MCP tool, named `question` — feature text: "be limited to just one command `question` at the moment".
5. The `question` tool takes the arguments `tab`, `kind` (`ask` or `approve`), `question`, and, for `approve`, `options` — user answer: "arguments {tab, kind: "ask"|"approve", question, options?}".
6. An unknown `kind`, an empty question, or an `approve` with no options returns an MCP tool error result and opens no panel — user answer: "Return an MCP tool result flagged isError with a specific message".
7. The tool declares exactly four error texts: `No tab named "<tab>".`, `kind must be "ask" or "approve".`, `question must not be empty.`, and `approve needs at least one option.` — user answer: "Specific sentences". The first is produced by the executor in `janissary-mcp-server-4-local-question-executor.md` after tab resolution; the other three are produced here before any executor runs.

Requirements 2 and 3 are shared with `janissary-mcp-server-5-local-server-manager.md`: this subplan implements the check, that one supplies the token it checks against. Requirement 7 is shared with `janissary-mcp-server-4-local-question-executor.md`: this subplan declares all four texts, that one produces the `No tab named "<tab>".` case after resolving the tab.

## Design decisions

- The `question` tool is an ordinary blocking MCP tool call whose result is the user's answer, not MCP elicitation. Elicitation renders in the harness's own UI, and the 2026-07-28 protocol revision removes the server-to-client request channel it uses. The tool callback awaits the existing `Questions.register` so queueing, notifications and cancellation behave as they already do. Sources: https://code.claude.com/docs/en/mcp.md, https://opencode.ai/docs/mcp-servers.md, https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28.md, https://developers.cloudflare.com/agents/model-context-protocol/guides/migrate-to-mcp-sdk-v2/
- The MCP protocol layer is the official TypeScript SDK v2 — `@modelcontextprotocol/server@2.4.0` with `@modelcontextprotocol/node@2.1.2` (and their `@modelcontextprotocol/core`, `zod` ^4, `hono`, `@hono/node-server` dependencies) — using the stateless `createMcpHandler(() => createServer())` wrapped by `toNodeHandler()` behind Janissary's own guard on a `node:http` server; every new package version passes `check-malicious-package` before it is added. User answer: "Adopt SDK v2". Sources: https://github.com/modelcontextprotocol/typescript-sdk/releases, https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2.md, https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28.md, https://developers.cloudflare.com/agents/model-context-protocol/guides/migrate-to-mcp-sdk-v2/
- The listener will bind loopback only and serve plain HTTP behind a guard that refuses a present-but-wrong Origin, requires the bearer token in the `Authorization` header, and rejects a non-JSON POST. It reuses `originAllowed` and `tokenMatches` from `src/security.ts`, adds a header-reading token helper, and uses a credential separate from the application's session token, as `product/specs/harness.md` requires. The remote hop is encrypted by SSH, so no TLS is used (user answer: "Plain HTTP on loopback"). Sources: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports.md, https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-w48q-cv73-mx4w, https://labs.cloudsecurityalliance.org/research/csa-research-note-mcp-transport-trust-gap-20261109-csa-style/, https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2.md
- MCP code is a new core subsystem under `src/mcp/`: the request guard, the SDK handler factory, and a tool registry in which each tool is declared once with its input schema (today only `question`). An executor receives the tool name, the validated arguments, and an `AbortSignal`, and resolves to `{ text, isError }`. A later subplan supplies the executor; exposing another Janissary command later is one registry entry. User answer: "New core `src/mcp/` + tool registry".
- The handler sends no progress heartbeats: launch-time timeout settings in a later subplan are what keep a call waiting on a human alive. If a harness version is found to abort idle calls regardless of its timeout setting, the upgrade path is a periodic progress notification in `src/mcp/handler.ts`.

## Preserved behavior

1. ACP agent `question ask` / `question approve` commands still parse and register for the issuing tab, and malformed input still returns usage text. Negative assertion: the MCP tool's own validation must not change the command parser's accepted grammar, and must not register a malformed command. Test: `src/question-command.test.ts` "registers a valid command for the issuing tab".

## Assumptions

1. Each harness is pointed at the server per launch without writing the user's own harness config, and reads the bearer token from an environment variable rather than argv; claude's token variable name avoids the `ANTHROPIC_*` prefix that claude blanks in headers. Anchored in `product/specs/harness.md` § End-to-end browser ("Janissary does not inject the live application's URL or session token") and the source plan's design decisions.
2. A question is registered against a tab label and resolves to the answer or `Question cancelled.` — `src/questions.ts:25` `register(request: QuestionRequest, signal?: AbortSignal): Promise<string>`.
3. Token minting, origin checking and constant-time comparison already exist — `src/security.ts:5` `export function makeToken()`, `src/security.ts:16` `originAllowed`, `src/security.ts:40` `tokenMatches`.

## Existing functionality

1. Token minting, origin check and constant-time token comparison — `src/security.ts:5` `export function makeToken()`, `src/security.ts:16` `originAllowed`, `src/security.ts:40` `tokenMatches`.
2. Per-tab question queue with cancellation, used by the tool callback in a later subplan — `src/questions.ts:25` `register(`.
3. `question ask` / `question approve` parsing and usage text, whose grammar this tool's validation must not disturb — `src/question-command.ts:29` `export function parseQuestionCommand`.

## Implementation steps

1. Run `$janissary/scripts/run.mjs check-malicious-package @modelcontextprotocol/server@2.4.0 @modelcontextprotocol/node@2.1.2 @modelcontextprotocol/core@2.4.0` before touching dependencies and do not add a version that exits non-zero. Add `@modelcontextprotocol/server` and `@modelcontextprotocol/node` to `dependencies` in `package.json`, then run `$janissary/scripts/run.mjs check-malicious-package --audit ./package-lock.json`. First confirm with a ten-line throwaway spike that `toNodeHandler(createMcpHandler(…))` serves a request when handed directly to a `node:http` `createServer`; if it does not, mount it through `@hono/node-server`'s `getRequestListener` instead. Build and check with `$janissary/scripts/run.mjs check-diff`.
2. Create `src/mcp/tools.ts`: the tool registry, a read-only list of tool definitions (name, description, input schema) plus the executor contract. An executor receives the tool name, the validated arguments, and an `AbortSignal`, and resolves to `{ text, isError }`. Export the contract type so the local executor in `janissary-mcp-server-4-local-question-executor.md` implements exactly one signature. Build and check with `$janissary/scripts/run.mjs check-diff`.
3. Create `src/mcp/question-tool.ts`: the single `question` definition. Its validation produces exactly the four requirement-7 texts and runs before any executor is called, including the `No tab named "<tab>".` case once the executor resolves the tab. Build and check with `$janissary/scripts/run.mjs check-diff`.
4. Create `src/mcp/handler.ts`: build the SDK handler from the registry and an injected executor, registering every registry entry with `createMcpHandler(() => createServer())`. Pass the request's abort signal to the executor. Send no progress heartbeats. Build and check with `$janissary/scripts/run.mjs check-diff`.
5. Add `bearerToken(request)` to `src/security.ts` beside `tokenFromReq`, reading the `Authorization: Bearer` header. Create `src/mcp/guard.ts`: wrap the handler, answering `403` for a present Origin that `originAllowed` (`src/security.ts:16`) rejects, `401` when the token fails `tokenMatches` (`src/security.ts:40`), and `415` for a POST whose content type is not `application/json`; a valid request reaches the handler. No module calls these yet, so the tree stays green. Build and check with `$janissary/scripts/run.mjs check-diff`.

Every touched file stays under the 200-line `max-lines` limit; these are new, focused modules. Relative imports in `src/` carry the `.js` extension per NodeNext.

## UI design

1. This subplan adds no user-visible surface; it is protocol plumbing. The non-modal question panel it will drive is the existing `web/src/shared/questions/QuestionPanel.tsx`, rendered by `web/src/MountedViewLayers.tsx` for the current tab.

## Tests

- `src/mcp/question-tool.test.ts`: each of the four requirement-7 error texts, and a valid `ask` and `approve` passing validation (requirements 5, 6, 7).
- `src/mcp/guard.test.ts`: a wrong Origin gets 403, a missing or wrong bearer token gets 401, a non-JSON POST gets 415, and a valid request reaches the handler (requirements 2, 3).

## Out of scope

- Any listener, port or file persistence: the modules built here are inert until `janissary-mcp-server-5-local-server-manager.md` mounts them.
- Any tool other than `question`.
- Exposing the live application's URL or session token to harnesses.
- TLS, HTTPS and a network-facing bind.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after each step. Then, for a reading-based check, read `package.json` and confirm `@modelcontextprotocol/server@2.4.0` and `@modelcontextprotocol/node@2.1.2` are in `dependencies`, read `src/mcp/tools.ts` and confirm exactly one registry entry named `question`, and read `src/mcp/guard.ts` and confirm the three status codes map to Origin, token and content type respectively. A failure is a missing dependency, a second registry entry, or a guard that lets a request through without a token.
