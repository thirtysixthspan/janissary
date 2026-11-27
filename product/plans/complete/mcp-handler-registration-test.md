# test: cover MCP handler tool registration and error results

**Complexity: 2/10** — 7 requirements, 5 test scenarios, 0 production lines/files/units changed (test-only) (p=3.71)

## Goal

Pin the observable contract of `createHandler` in `src/mcp/handler.ts` with a colocated test. The handler wires tool registration, argument validation, abort-signal forwarding and the `isError` tool-result branch, but has no test file while the guard and the argument validator each have one. A regression in the registration loop or in mapping a validation error to an error tool result would otherwise ship with no failing test. This change adds only that test; it changes no application behavior.

Source: the `./product/backlog/pull-request.md` entry resolved by `execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "add a colocated test for MCP handler tool registration and error results"`.

## Requirements

1. The handler registers the single `question` tool using the registry entry's name, description and input schema — entry text: "capture the callback passed to registerTool".
2. A valid question produces a text tool result with `isError` false — entry text: "a valid question produces a text result with isError false".
3. An invalid `kind` produces a text tool result with `isError` true whose text is exactly `QUESTION_ERROR.invalidKind` — entry text: "an invalid kind … produce a text result with isError true carrying the exact QUESTION_ERROR message from src/mcp/question-tool.ts".
4. An empty question produces a text tool result with `isError` true whose text is exactly `QUESTION_ERROR.emptyQuestion` — entry text: "an empty question … produce a text result with isError true carrying the exact QUESTION_ERROR message".
5. An `approve` with no options produces a text tool result with `isError` true whose text is exactly `QUESTION_ERROR.missingOptions` — entry text: "an approve without options … produce a text result with isError true carrying the exact QUESTION_ERROR message".
6. The executor receives the captured request abort signal — entry text: "the executor receives the captured signal".
7. A validation error returns an error tool result without invoking the executor — entry text: "mapping a validation error to an error tool result".

## Design decisions

- The test mocks `@modelcontextprotocol/server` rather than spinning up a transport: the SDK's own HTTP behavior is not under test here, and the entry says to leave "only the SDK's own transport behavior untested". The mock's `createMcpHandler` invokes the factory it is given so registration runs synchronously, and a mocked `McpServer` exposes a `registerTool` spy that captures the callback.
- The captured callback is invoked directly with representative arguments and a context whose `mcpReq.signal` is a stub `AbortSignal`, so the assertions target the tool-result contract rather than a wire protocol.
- Error texts are asserted against the `QUESTION_ERROR` constants exported by `src/mcp/question-tool.ts`, not copied string literals, so the test pins the exact message the validator produces.
- `src/mcp/handler.ts` is not edited. The colocated test lives at `src/mcp/handler.test.ts`, beside `src/mcp/guard.test.ts` and `src/mcp/question-tool.test.ts`, and follows their `describe`/`it`/`expect` style.

## Preserved behavior

1. `validateQuestionArgs` keeps rejecting an unknown kind with the exact text `kind must be "ask" or "approve".`. Negative assertion: the new test must not alter the validator or its message, and must not accept an invalid kind. Test: `src/mcp/question-tool.test.ts` "rejects an unknown kind with the exact error text".
2. The request guard keeps its status mapping for a rejected Origin. Negative assertion: the new test must not change the guard or let an unauthenticated request through. Test: `src/mcp/guard.test.ts` "answers 403 for a present origin the loopback check rejects".

## Assumptions

1. `createHandler` builds the SDK handler by calling `createMcpHandler` with a factory — `src/mcp/handler.ts:15` `return createMcpHandler(() => {`.
2. Tool registration is the `registerTool` call whose third argument is the callback under test — `src/mcp/handler.ts:18` `server.registerTool(`.
3. The abort signal forwarded to the executor is the request signal on the callback context — `src/mcp/handler.ts:24` `ctx.mcpReq.signal`.
4. The exact validation messages are the exported constants — `src/mcp/question-tool.ts:3` `export const QUESTION_ERROR`.
5. The registry holds exactly one tool, `question` — `src/mcp/tools.ts:24` `export const TOOLS: readonly ToolDefinition[] = [`.
6. `vi.hoisted` plus `vi.mock` is an established pattern in this codebase — `src/server-log/directory.test.ts:5` `const { reapFilesOlderThan } = vi.hoisted(() => ({`.

## Existing functionality

1. The module-mock-with-hoisted-spy pattern — `src/server-log/directory.test.ts:5` `vi.hoisted(() => ({ reapFilesOlderThan: vi.fn() }))`.
2. The single-entry tool registry with name, description and input schema — `src/mcp/tools.ts:24` `export const TOOLS`.
3. The argument validator and its exact error constants — `src/mcp/question-tool.ts:17` `export function validateQuestionArgs`.
4. The executor contract `(name, args, signal) => Promise<{ text, isError }>` — `src/mcp/tools.ts:5` `export type ToolExecutor`.
5. The colocated Vitest style used by the neighbouring MCP tests — `src/mcp/question-tool.test.ts` and `src/mcp/guard.test.ts`.

## Implementation steps

1. Create `src/mcp/handler.test.ts`. Mock `@modelcontextprotocol/server` so `createMcpHandler` invokes the supplied factory and a mocked `McpServer` records `registerTool` calls in a hoisted spy; add a helper that calls `createHandler` with an injected `ToolExecutor`, asserts the single `question` registration (name, description, input schema) and returns the captured callback. Build and check with `$janissary/scripts/run.mjs check-diff`.
2. Add callback-invocation tests: a valid `ask` returns `{ content: [{ type: 'text', text: … }], isError: false }` and passes the validated arguments and tool name to the executor, while an invalid kind, an empty question and an approve with no options each return a text result with `isError: true` carrying the matching `QUESTION_ERROR` constant and never call the executor. Build and check with `$janissary/scripts/run.mjs check-diff`.
3. Add a test asserting the exact `AbortSignal` instance from `ctx.mcpReq.signal` reaches the executor as its third argument. Build and check with `$janissary/scripts/run.mjs check-diff`.

No production source file is edited. `src/mcp/handler.ts`, `src/mcp/guard.test.ts` and `src/mcp/question-tool.test.ts` stay byte-for-byte unchanged. The new file stays well under the 200-line `max-lines` limit; relative imports carry the `.js` extension per NodeNext.

## UI design

1. This change adds no user-visible surface; it is a colocated test addition only.

## Tests

- `src/mcp/handler.test.ts`: registration of the single `question` tool with its registry name, description and input schema (requirement 1).
- `src/mcp/handler.test.ts`: a valid question yields a non-error text result and passes validated arguments to the executor (requirements 2, 6).
- `src/mcp/handler.test.ts`: an invalid kind, an empty question and an approve with no options each yield an error text result with the exact `QUESTION_ERROR` message and skip the executor (requirements 3, 4, 5, 7).
- `src/mcp/handler.test.ts`: the captured signal is forwarded verbatim to the executor (requirement 6).

## Out of scope

- A second tool in the registry or any per-tool validator.
- Any edit to `src/mcp/handler.ts`, `src/mcp/guard.test.ts` or `src/mcp/question-tool.test.ts`.
- The declined multi-tool validation finding; it stays out of scope.
- SDK transport behavior, HTTP wiring, and functional-spec or help-page changes: the fix changes no application behavior.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after each step. Then read `src/mcp/handler.test.ts` and confirm it mocks `@modelcontextprotocol/server`, captures the callback passed to `registerTool`, asserts the exact `QUESTION_ERROR` constants and asserts signal identity, while `git diff --name-only` shows no change to `src/mcp/handler.ts`, `src/mcp/guard.test.ts` or `src/mcp/question-tool.test.ts`. As a concrete check, run the single file with `npx vitest run --project server src/mcp/handler.test.ts` and expect five passing tests; a failure is a mismatched tool-result shape, a copied error string, or a missing signal assertion.
