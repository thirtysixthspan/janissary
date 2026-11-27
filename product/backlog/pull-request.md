<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Replace the question-only validation hard-coded into the generic MCP tool loop with per-tool validation.

Existing Issue: The handler iterates over the shared TOOLS registry but calls validateQuestionArgs for every registered tool, so the arguments of any tool added to that registry are coerced into question fields and its own fields are discarded before the executor sees them. Severity: 5/10

Existing Risk: 5/10 - A second tool registered in TOOLS receives silently reshaped arguments and produces wrong results that surface only at runtime, with no compile-time or test signal that the registry contract was broken.

Proposal Risk: 2/10 - Each tool would carry its own validator beside its schema in the registry, so a new tool must be registered with both, which the registry type can enforce.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "dispatch MCP tool argument validation by tool name instead of always using question validation". In src/mcp/tools.ts, extend ToolDefinition with a validator field typed to accept an argument record and return either validated arguments or an error string, and attach validateQuestionArgs to the question entry while keeping questionInputSchema as its input schema. In src/mcp/handler.ts, replace the unconditional validateQuestionArgs call inside the loop with the validator carried by definition, pass its result to the executor, and keep converting an error result into a text tool result with isError set. Add a test in src/mcp/handler.test.ts that registers two differently shaped tools through createHandler with a stub executor and asserts each executor receives its own validated arguments and that an invalid question still yields an error result; keep src/mcp/question-tool.test.ts and src/mcp/guard.test.ts passing unchanged.


* Cover the MCP handler's tool registration and error-result path with a colocated test.

Existing Issue: The new handler module wires tool registration, argument validation, abort-signal forwarding and the isError tool-result branch but has no test file, while the guard and the argument validator each have one. Severity: 3/10

Existing Risk: 4/10 - A regression in the registration loop or in mapping a validation error to an error tool result would ship without any test failing, and callers would see only a wrong tool response.

Proposal Risk: 2/10 - A focused test pins the observable tool-result contract for registration and error mapping, leaving only the SDK's own transport behavior untested here.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "add a colocated test for MCP handler tool registration and error results". Add src/mcp/handler.test.ts that uses vi.mock on the server module to capture the callback passed to registerTool, then invokes it with representative arguments and a context whose mcpReq.signal is a stub AbortSignal; assert a valid question produces a text result with isError false, that an invalid kind, an empty question and an approve without options each produce a text result with isError true carrying the exact QUESTION_ERROR message from src/mcp/question-tool.ts, and that the executor receives the captured signal. Follow the conventions of src/mcp/guard.test.ts and leave that file and src/mcp/question-tool.test.ts unchanged.
