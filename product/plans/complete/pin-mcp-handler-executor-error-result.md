# feat: pin the MCP handler's executor-reported error result in tests

**Complexity: 1/10** — no production lines or files (one test case), 4 requirements and 1 scenario (p=2.97).

## Goal

The MCP handler already maps an executor result that reports `isError: true` into an error tool result, but the colocated test never drives the captured callback with such an executor. The goal is to add one focused case in `src/mcp/handler.test.ts` that pins this pass-through, so a regression that drops or hardcodes the executor's `isError` flag cannot ship with every test green. No application behavior changes; this is test coverage for behavior the handler already implements.

## Requirements

1. "never drives the captured callback with an executor that returns isError true, so the handler's mapping of an executor error to an error tool result is untested" — the new case drives the captured callback with a `ToolExecutor` mock that resolves to `{ text: 'Denied', isError: true }`.
2. "assert the returned tool result equals { content: [{ type: 'text', text: 'Denied' }], isError: true }" — the returned tool result carries `isError: true` and the text `Denied`.
3. "assert that the executor was called once with the 'question' tool name" — the executor is called exactly once, and its first argument is `'question'`.
4. "obtains the captured callback through the existing hoisted registerTool spy helper and invokes it with arguments that pass validateQuestionArgs" — the case uses the existing `capturedCallback` helper and valid `{ tab, kind: 'ask', question }` arguments, so validation succeeds and reaches the executor.

## Design decisions

- Add exactly one case inside the existing `describe('createHandler')` block in `src/mcp/handler.test.ts`; change no production file.
- Obtain the callback through the existing `capturedCallback` helper backed by the hoisted `registerToolSpy`, rather than introducing a new spy or mock module.
- Use the established `vi.fn<ToolExecutor>(async () => ({ … }))` mock shape and valid `ask` arguments, so the call passes `validateQuestionArgs` and actually exercises the executor path.
- Keep the existing `.js` relative import style and keep `src/mcp/handler.test.ts` below the 200-line `max-lines` limit.

## Preserved behavior

1. A valid executor result still produces a non-error text result and reaches the executor with the question name, validated arguments and abort signal. Negative assertion: the new case must not make valid results report `isError: true`. Representative test: `src/mcp/handler.test.ts` "registers the question tool and returns a non-error text result for a valid question".
2. Validation errors still produce their exact error tool results without calling the executor. Negative assertion: the new case must not let invalid arguments reach the executor. Representative test: `src/mcp/handler.test.ts` "maps $label to an exact error tool result without calling the executor".
3. The request abort signal still reaches the executor unchanged. Negative assertion: the new case must not substitute or drop that signal. Representative test: `src/mcp/handler.test.ts` "forwards the request abort signal to the executor".

## Assumptions

1. `src/mcp/handler.ts:25` returns `toolResult(result.text, result.isError)`, and `src/mcp/handler.ts:10-12` builds `{ content: [{ type: 'text', text }], isError }`, so an executor resolving to `{ text: 'Denied', isError: true }` already yields the asserted result with no production change.
2. `src/mcp/tools.ts:3` declares `export type ToolResult = { text: string; isError: boolean };` and `:5-9` declares `ToolExecutor`, so the mock shape satisfies the executor contract.
3. `src/mcp/handler.test.ts:11` defines the hoisted `registerToolSpy` and `:23-31` defines `capturedCallback`, which returns the registered callback; the new case reuses this exact path.
4. `src/mcp/question-tool.test.ts:27-33` ("accepts a valid ask") confirms `{ tab: 'build', kind: 'ask', question: '…' }` passes `validateQuestionArgs`.

## Existing functionality

1. The hoisted `registerToolSpy` and the `capturedCallback` helper that retrieves and returns the registered tool callback — `src/mcp/handler.test.ts:11`, `:23-31`.
2. The `vi.fn<ToolExecutor>` mock pattern used by the neighbouring cases — `src/mcp/handler.test.ts:39`, `:56`, `:69`.
3. The `context(signal)` helper that wraps an `AbortSignal` as the MCP request context — `src/mcp/handler.test.ts:33-35`.
4. The handler's executor-error mapping through `toolResult` — `src/mcp/handler.ts:10-12`, `:25`.

## Implementation steps

1. In `src/mcp/handler.test.ts`, inside `describe('createHandler')`, add one `it` case using the helpers from Existing functionality 1–3: create `const executor = vi.fn<ToolExecutor>(async () => ({ text: 'Denied', isError: true }));`, call `await capturedCallback(executor)({ tab: 'build', kind: 'ask', question: 'Proceed?' }, context(new AbortController().signal))`, assert the result equals `{ content: [{ type: 'text', text: 'Denied' }], isError: true }`, and assert the executor was called once with `'question'` as its first argument. Mirror the imports, naming and assertion style of the neighbouring cases, keep relative imports with `.js` extensions, and leave the file under 200 lines. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Run `$janissary/scripts/run.mjs check-diff` and resolve any lint, typecheck or test failure before moving on. No production file is edited by this plan, so there is no server/client contract to keep in step.

## UI design

None. This change adds one test case and touches no user interface.

## Tests

1. Requirements 1 and 2: the new case in `src/mcp/handler.test.ts` asserts that an executor reporting `{ text: 'Denied', isError: true }` yields `{ content: [{ type: 'text', text: 'Denied' }], isError: true }`, pinning the `isError` pass-through.
2. Requirement 3: the same case asserts `expect(executor).toHaveBeenCalledOnce()` and that the first call's first argument is `'question'`.
3. Requirement 4: the case reaches the executor only because it uses `capturedCallback` with arguments that pass `validateQuestionArgs`; a validation regression fails the case.
4. Preserved behaviors 1–3: the existing valid-result, three validation-error and signal-forwarding cases must still pass; `$janissary/scripts/run.mjs check-diff` exercises them.

## Out of scope

- Editing `src/mcp/handler.ts`, `src/mcp/guard.test.ts`, or `src/mcp/question-tool.test.ts`; each stays byte-for-byte unchanged.
- Adding a second tool to the `TOOLS` registry or introducing per-tool validators; that multi-tool proposal was declined.
- Refactoring `toolResult` or any production code, and creating or editing a help page or functional spec for behavior that already exists; no user or developer documentation is touched.

## Verification

`$janissary/scripts/run.mjs check-diff` first. Then run the per-file server Vitest command used for the neighbouring MCP tests — `npx vitest run --project server src/mcp/handler.test.ts src/mcp/guard.test.ts src/mcp/question-tool.test.ts` — and confirm all three files pass, with the new case visible by name in the output. Finally, read `src/mcp/handler.test.ts` and confirm the new case obtains its callback from `capturedCallback`, passes valid `ask` arguments, asserts the exact `{ content: [{ type: 'text', text: 'Denied' }], isError: true }` result, and checks the `'question'` tool name; a failure is a case that asserts `isError: false` or never reaches the executor.
