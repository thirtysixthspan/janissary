<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle the MCP handler's executor-reported error result in the colocated test so the isError pass-through is pinned.

Existing Issue: The new handler test covers a successful executor result, three validation-error results and signal forwarding, but never drives the captured callback with an executor that returns isError true, so the handler's mapping of an executor error to an error tool result is untested. Severity: 4/10

Existing Risk: 4/10 - A regression that drops or hardcodes the executor's isError flag would ship with every test green, so a denied approval or failed tool call would reach the model as a success result.

Proposal Risk: 2/10 - One focused case pins the mapping while the handler and all currently tested paths stay unchanged.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "test the MCP handler's executor-reported error result". In src/mcp/handler.test.ts, add one case inside the createHandler describe block that obtains the captured callback through the existing hoisted registerTool spy helper and invokes it with arguments that pass validateQuestionArgs, using a ToolExecutor mock that resolves to { text: 'Denied', isError: true }; assert the returned tool result equals { content: [{ type: 'text', text: 'Denied' }], isError: true } and that the executor was called once with the 'question' tool name. Keep src/mcp/handler.ts, src/mcp/guard.test.ts and src/mcp/question-tool.test.ts byte-for-byte unchanged, keep the relative .js imports and the file below the 200-line limit, and verify with the same per-file Vitest run used for the neighbouring MCP tests. The valid-result, three validation-error and signal-identity assertions already in the file cover the behavior that must not move.
