# docs(mcp): correct the MCP server spec's error text for a local non-string option

**Complexity: 1/10** — no production lines or files, 6 requirements, no test scenarios (p=2.95)

## Goal

The `question` tool section of `product/specs/mcp-server.md` lists `options must be a list of strings.` among the exact texts a call receives. A local call never gets it. The SDK checks the tool's declared input schema before Janissary's own validation runs, so a non-string option on the local HTTP path comes back as the SDK's own `Input validation error: ...` tool error. Only an `mcp-call` frame that the local side decodes from a remote session reaches the sentence. A harness author or tester who trusts the list would match on text the local server never sends. This plan moves that bullet to the Remote relay section, says how the local path refuses a type mismatch, and stops the Remote relay section from implying the options sentence is shared with local calls.

## Requirements

1. The `question` tool section's exact-text list no longer includes `options must be a list of strings.`, per the issue "only relayed remote calls ever get the listed sentence".
2. The `question` tool section says arguments whose types don't match the tool's declared schema are refused by the MCP layer with its own input-validation tool error before the exact checks run, per the proposal "add one sentence to the local section saying arguments whose types do not match the tool's declared schema are refused by the MCP layer with its own input-validation tool error before the exact checks run".
3. That sentence describes the SDK's message without quoting it in full, per the proposal risk "an SDK upgrade rewording its own validation message, which the spec would describe without quoting".
4. The Remote relay section says a relayed `question` call whose options hold anything other than a string fails with `options must be a list of strings.`, per the proposal "move that bullet ... into the Remote relay section beside the other relayed-call texts".
5. The Remote relay section no longer says relayed arguments get "the same exact texts, as a local call" in a way that implies the options sentence is shared, per the proposal "adjust the Remote relay sentence ... so it no longer implies the options sentence is shared".
6. The other four exact texts in the `question` tool section stay verbatim, per the proposal "move that bullet out", which names only the one bullet.

## Design decisions

- Only `product/specs/mcp-server.md` changes. The version-49 paragraph of `product/specs/remote-server.md` says a refused relayed call is answered "with ... the validation text given in [[mcp-server]]", which still holds once the options text sits in the Remote relay section of that spec (Assumption 6). The proposal makes that edit conditional on the sentence implying the shared text, and it doesn't.
- The local sentence names the SDK's message only by its leading `Input validation error:` prefix, which is enough for a reader to recognize it, and doesn't quote the rest, which the SDK owns (Assumption 2).
- The local sentence speaks of type mismatches generally rather than options alone, because the same SDK check refuses a non-string `tab`, `kind` or `question` on the local path too (Assumption 1). That keeps the existing list accurate for the cases it still covers, such as an empty string question or an unknown string kind.
- The Remote relay sentence is reworded so the shared validation is the four texts both paths produce, and the extra texts the relay alone produces, the non-string question, the non-string `tab` and now the non-string option, are named as relayed-only. The relay is the only caller that reaches Janissary's validation with untyped arguments, since the far side's own endpoint runs the same SDK check before relaying (Assumption 4).
- No code or test changes, because the proposal says so and existing tests pin the sentence where it's produced (Preserved behavior 1 and 2).

## Preserved behavior

1. Janissary's own validation returns `options must be a list of strings.` for a list holding a non-string option, for either kind. The spec correction must not change `validateQuestionArgs`, so that text must not change or disappear. Pinned by `rejects a non-string option for %s with the exact error text` in `src/mcp/question-tool.test.ts`.
2. A relayed `question` call with a non-string option is answered with `options must be a list of strings.` and registers no question. The correction must not change the relay, so the refused call must not open a panel or claim its id. Pinned by `refuses $label without registering and lets a later valid call with the same id register` in `src/remote/mcp-relay.test.ts`.
3. The local handler maps the exact validation texts to tool errors without calling the executor. The correction must not touch the handler, so those mappings must not change. Pinned by `maps $label to an exact error tool result without calling the executor` in `src/mcp/handler.test.ts`.

## Assumptions

1. The tool's declared schema types every argument, with options as a list of strings: `src/mcp/tools.ts:15` "`options: z.array(z.string()).optional(),`".
2. The SDK refuses schema mismatches before the callback, and its call handler turns that into a tool error: `node_modules/@modelcontextprotocol/server/dist/mcp-oHn3ureC.mjs:1642` "`` `Input validation error: Invalid arguments for tool ${toolName}: ${parseResult.error}` ``" and `node_modules/@modelcontextprotocol/server/dist/mcp-oHn3ureC.mjs:1615` "`return this.createToolError(`".
3. The local handler registers that schema and runs Janissary's validation only inside the callback: `src/mcp/handler.ts:20` "`inputSchema: definition.inputSchema`" and `src/mcp/handler.ts:22` "`const validated = validateQuestionArgs(args as Record<string, unknown>);`".
4. The far side's endpoint uses the same handler, so a remote harness's call passes the same SDK check before it's relayed: `src/remote/serve-mcp.ts:61` "`this.handler = createHandler(this.relay);`".
5. The relay validates decoded frame arguments itself: `src/remote/mcp-relay.ts:22` "`return validateQuestionArgs(args as Record<string, unknown>);`", which returns the options text at `src/mcp/question-tool.ts:33` "`if (!listed) return { error: QUESTION_ERROR.invalidOptions };`".
6. The remote-server spec refers to the mcp-server spec for the validation text without saying it's shared with local calls: `product/specs/remote-server.md:355` "the validation text given in [[mcp-server]]".

## Existing functionality

1. The exact-text list being corrected: `product/specs/mcp-server.md:23` "`options must be a list of strings.` when any option is not a string, for either kind."
2. The Remote relay sentence being reworded: `product/specs/mcp-server.md:59` "A `question` call's arguments get the same validation, with the same exact texts, as a local call."

## Implementation steps

1. In The `question` tool section of `product/specs/mcp-server.md`, delete the `options must be a list of strings.` bullet. After the list, add one sentence saying a call whose arguments don't match the tool's declared types, such as an option that isn't a string, is refused earlier by the MCP layer with its own input-validation tool error, whose text starts with `Input validation error:`, and opens no panel. In the Remote relay section's second paragraph, replace "A `question` call's arguments get the same validation, with the same exact texts, as a local call. That includes ..." with wording that says a `question` call's arguments get the same exact checks as a local call, and that because the relay sees the arguments without the MCP layer's type check, it also refuses a non-string question with `question must not be empty.`, a non-string `tab` as the empty name with `No tab named "".`, and a list holding a non-string option, for either kind, with `options must be a list of strings.`. Leave every other sentence as it is. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Promote this plan to `product/plans/complete/` and remove the resolved entry from `product/backlog/pull-request.md`, leaving the other entries unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The change is to a spec file only, and no user-visible surface changes.

## Tests

This plan changes no application behavior and introduces no code, so it adds no tests. The tests named under Preserved behavior already pin the options sentence where it's produced.

## Out of scope

- Any change to `validateQuestionArgs`, `createHandler`, `decodeCall` or the tool schema.
- The relay's handling of an `options` value that isn't a list at all, which it treats as no options.
- `product/specs/remote-server.md`, whose version-49 paragraph stays accurate.
- The other entries in `product/backlog/pull-request.md`.
- `documentation/user-documentation/` and `documentation/developer-documentation/`.
- The PR description and title.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then read The `question` tool and Remote relay sections of `product/specs/mcp-server.md` against `createHandler` in `src/mcp/handler.ts` and `decodeCall` in `src/remote/mcp-relay.ts`. The `question` tool section's list should hold four texts and no longer list `options must be a list of strings.`. A following sentence should say a type mismatch, such as a non-string option, is refused by the MCP layer with a tool error starting `Input validation error:`. The Remote relay section should list `options must be a list of strings.` as a relayed-call text beside the non-string question and non-string `tab` cases. Finding the options bullet still in the local list, or the phrase "with the same exact texts, as a local call" still standing unqualified, means the correction was wrong. Also confirm the version-49 paragraph of `product/specs/remote-server.md` still points at [[mcp-server]] for the validation text and says nothing about the local path.
