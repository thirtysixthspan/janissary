# Validate the tool name and arguments of relayed MCP calls before the local side runs them

**Complexity: 5/10** — 9 requirements and 7 test scenarios over ~25 added lines in 3 files (p=5.30)

## Goal

A remote harness's MCP call reaches the local Janissary as an `mcp-call` frame, and the local relay hands it straight to the question executor. The relay never checks the frame's `tool` field, and the executor casts the arguments to `QuestionArgs` without checking their types. So the only validation a remote call gets is the far side's own. This fix makes the local side check what it runs: a call naming any tool other than `question` is refused, and the arguments go through the same validator the local HTTP path uses, tightened so every option must be a string. A refused call opens no panel and leaves its id free for a later valid call.

## Requirements

1. "refuse a `frame.tool` that is not the name of an entry in `TOOLS`": a relayed call whose tool is not a known tool is answered with an `isError` `mcp-result` reading `Unknown MCP tool "<tool>".`
2. "register nothing": a call refused for an unknown tool registers no question.
3. "run `validateQuestionArgs` ... on the parsed object and answer its `error` text as an `isError` result": a relayed call whose arguments fail validation is answered with the validator's exact error text as an `isError` `mcp-result`.
4. A relayed call with a non-string `question` is answered with `question must not be empty.` and registers nothing.
5. A relayed call with an unknown `kind` is answered with `kind must be "ask" or "approve".` and registers nothing.
6. "every `options` element must be a string": a call whose `options` array holds a non-string element is answered with the new exact text `options must be a list of strings.`, for both `ask` and `approve`.
7. "before any `AbortController` or pending entry is created, so a rejected call leaves its id unclaimed": after any of these refusals, a later valid call with the same id registers and is answered normally.
8. "a non-string `tab` keeps resolving as the empty name and returning `No tab named "".`": a relayed call with a non-string `tab` is answered with `No tab named "".`
9. The spec states the unknown-tool text, the new options text, and that relayed calls are validated on the local side.

## Design decisions

- The relay's checks move into one module-local decode step in `src/remote/mcp-relay.ts` that turns a frame into validated `QuestionArgs` or an error text. `handle` answers that error and returns before it creates an `AbortController` or a pending entry, the same way the malformed-arguments path already returns (Assumption 1).
- The order is: parse, non-object check, tool name check, then argument validation. That keeps today's `Malformed MCP arguments: <args>` answer for every undecodable payload whatever its tool, as the backlog proposal orders it.
- The tool check accepts a name only when an entry in `TOOLS` carries it, so adding a tool to `TOOLS` is the one place a new name becomes acceptable (Assumption 3).
- The unknown-tool text lives in `src/mcp/tools.ts` beside `TOOLS` as an exported formatter, so the relay and its tests share one definition.
- `validateQuestionArgs` gets the options element check, with the new text added to `QUESTION_ERROR`. It runs after the kind and question checks and before the approve-needs-options check, so an `approve` with `[]` still gets `approve needs at least one option.` (Assumption 2).
- A non-array `options` value is left as it is today: dropped for `ask` and refused as missing for `approve`. Only an array with a non-string element gets the new text. That keeps the change to the one shape the cast at `src/mcp/question-tool.ts:28` lies about.
- The local HTTP path keeps its behavior, because the SDK's zod schema already rejects non-string options before the validator runs there (Assumption 4).

## Preserved behavior

1. Malformed relayed arguments are answered with `Malformed MCP arguments: <args>` and a later valid call with the same id registers. A malformed payload must not be answered with an unknown-tool or validator text instead. Pinned by "answers malformed arguments as an error and lets a later valid call with the same id register" in `src/remote/mcp-relay.test.ts`.
2. A re-sent in-flight call attaches to its existing question. It must not register a second question. Pinned by "attaches a re-sent call to the in-flight question instead of registering a second" in `src/remote/mcp-relay.test.ts`.
3. A re-sent settled call is answered from its stored result. It must not register again. Pinned by "answers a re-sent settled call from the stored result without registering again" in `src/remote/mcp-relay.test.ts`.
4. The validator's existing exact texts stay as they are. An `approve` with `[]` must not be answered with the new options text. Pinned by "rejects an approve with no options with the exact error text" in `src/mcp/question-tool.test.ts`.
5. The local HTTP handler maps validator failures to tool errors without calling the executor. It must not start calling the executor for an invalid kind. Pinned by "maps $label to an exact error tool result without calling the executor" in `src/mcp/handler.test.ts`.

## Assumptions

1. The malformed-arguments path returns before any pending entry is set: `src/remote/mcp-relay.ts:33` "`if (typeof args !== 'object' || args === null || Array.isArray(args))`" precedes `src/remote/mcp-relay.ts:37` "`const controller = new AbortController();`".
2. The validator checks kind, then question, then approve options: `src/mcp/question-tool.ts:19-21` "`if (kind !== 'ask' && kind !== 'approve')`".
3. `TOOLS` is the list of advertised tools: `src/mcp/tools.ts:24` "`export const TOOLS: readonly ToolDefinition[]`".
4. The HTTP path's schema already requires string options: `src/mcp/tools.ts:15` "`options: z.array(z.string()).optional()`".
5. The executor trusts its arguments' types: `src/mcp/executor.ts:11` "`args as QuestionArgs`".
6. The far side relays its arguments as JSON text: `src/remote/serve-mcp.ts:182` "`args: JSON.stringify(args)`".

## Existing functionality

1. The shared validator: `src/mcp/question-tool.ts:17` "`validateQuestionArgs`".
2. The exact error texts: `src/mcp/question-tool.ts:3` "`QUESTION_ERROR`".
3. The local handler's use of the validator, the model for the relay: `src/mcp/handler.ts:22` "`const validated = validateQuestionArgs(args as Record<string, unknown>);`".
4. The relay's error answer helper: `src/remote/mcp-relay.ts:15` "`const answer = (call: string, result: ToolResult): void`".
5. The relay test fixture with a spied `register`: `src/remote/mcp-relay.test.ts:18` "`const register = vi.spyOn(questions, 'register');`".

## Implementation steps

1. In `src/mcp/question-tool.ts`, add an `invalidOptions` text, `options must be a list of strings.`, to `QUESTION_ERROR`, and make `validateQuestionArgs` return it when `options` is an array with any non-string element, after the question check and before the approve check. The returned `options` then needs no cast. In `src/mcp/tools.ts`, export a formatter for `Unknown MCP tool "<tool>".` Build command: `$janissary/scripts/run.mjs check-diff`.
2. In `src/remote/mcp-relay.ts`, extract the parse and non-object check from `handle` into a module-local decode function that also checks the tool name against `TOOLS` and runs `validateQuestionArgs`, returning validated `QuestionArgs` or an error text. `handle` answers an error as an `isError` result and returns before it creates the `AbortController`, otherwise it passes the validated arguments to the executor. Build command: `$janissary/scripts/run.mjs check-diff`.
3. Add the tests below, then update the specs. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The fix changes only which tool error a remote harness gets back; the question panel is unchanged, and a refused call never reaches it.

## Tests

- `src/remote/mcp-relay.test.ts`: an unknown tool (Requirements 1, 2, 7), a non-string question (4, 7), a non-string option (6, 7) and an unknown kind (5, 7). Each asserts the exact `mcp-result` text, no `register` call, and that a later valid call with the same id registers and answers. A non-string `tab` answers `No tab named "".` without registering (8).
- `src/mcp/question-tool.test.ts`: a non-string option is rejected with the exact new text for `approve` and for `ask` (6).

## Out of scope

The executor's `_name` parameter stays unused: dispatch by tool name is for when a second tool exists. The far side's own validation, the local HTTP path, the frame codec, and the protocol version are unchanged. A non-array `options` value is not newly rejected.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then run the relay tests on their own, `npx vitest run src/remote/mcp-relay.test.ts src/mcp/question-tool.test.ts`. The four new relay cases should pass, each showing the exact error text in its `mcp-result` assertion and no `register` call. A failure looks like a call to `register` for an unknown tool, or a `Malformed MCP arguments` text where the validator's text was expected. The remote relay path has no way to send a crafted frame from the running app, because the far side validates before it relays, so this targeted test run is the manual check. Finally read the Remote relay section of `product/specs/mcp-server.md` and confirm it names `Unknown MCP tool "<tool>".` and `options must be a list of strings.` verbatim.
