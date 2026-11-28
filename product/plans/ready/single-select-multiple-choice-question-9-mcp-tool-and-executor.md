# Accept choice calls across the MCP tool, handler, executor, and relay

**Complexity: 5/10** — ~45 added lines, 3 files, 7 requirements (p=5.34)

Source plan: `./product/plans/complete/single-select-multiple-choice-question.md`. Depends on `single-select-multiple-choice-question-6-choice-validator.md` for `validateChoiceRequest` and on `single-select-multiple-choice-question-7-questions-carry-through.md` for the server-core acceptance of choice answers.

## Goal

An MCP caller should be able to send a `choose` question with an array of `{label, description?}` objects and an exact `defaultOption`, and every path — local HTTP, far-side, and relayed remote — should return `Invalid choice question.` for malformed choice input. This subplan updates the tool schema and validator, the tool description, and the executor. It completes the tool half of requirement 1.

## Requirements

1. Provide a matching question-tool kind for `choose`, alongside the command half in `single-select-multiple-choice-question-8-command-parsing.md`. (requirement 1)
2. Provide option descriptions through the question tool, where `options` is a list of `{label, description?}` objects for `choose` and stays a string list for `approve`. (requirement 18, shared with the command half)
3. Allow a default selection through the question tool via an exact label. (requirement 20, shared with the command half)
4. "Return `Invalid choice question.` for invalid choice tool input." (requirement 34)
5. "Name the tool's default-label field `defaultOption`." (requirement 35)
6. A bare string element in a `choose` `options` list is invalid; extra keys on an option object are ignored; `defaultOption` is ignored for `ask` and `approve`.
7. A non-string `tab`, `kind`, or `question` still draws the SDK's own schema error for every kind, including `choose`.

## Design decisions

- In `src/mcp/question-tool.ts`, accept `choose` in the kind check, add `choices?` and `defaultOption?` to `QuestionArgs`, and delegate a `choose` call to `validateChoiceRequest` *before* running the existing `emptyQuestion` check, so a blank question on a choice call also returns `Invalid choice question.` (Assumption 1). Keep the approve checks unchanged.
- Update `QUESTION_ERROR.invalidKind` to `kind must be "ask", "approve", or "choose".` and add `QUESTION_ERROR.invalidChoice = 'Invalid choice question.'`. No failure reason is surfaced beyond that text.
- In `src/mcp/tools.ts`, apply two zod changes to `questionInputSchema`: change `options` to `z.unknown().optional()` so a malformed choice list gets past the SDK's own type check and reaches `validateQuestionArgs`; add `defaultOption: z.unknown().optional()` because `z.object` strips undeclared keys before the handler sees them (Assumption 2, Assumption 3). Keep `tab`, `kind`, and `question` as `z.string()`, so a non-string value for one still gets the SDK's schema error.
- Update the `question` tool description in the same file to spell out the `choose` shape: `options` is a list of `{label, description?}` objects, `defaultOption` is an exact label, and the answer is the chosen label or the person's typed text. With `options` typed `unknown`, the advertised JSON schema no longer describes the shape, so the prose must carry it.
- In `src/mcp/executor.ts`, pass `choices` and `defaultOption` into `register` alongside the existing fields, so the normalized values reach the question manager (Assumption 4).
- With `options` loosened, a malformed approve `options` sent through the local HTTP endpoint now gets `options must be a list of strings.` too, which is what the relay already returns. No edit to `handler.ts` or `mcp-relay.ts` is needed because both already route through `validateQuestionArgs` (Assumption 5, Assumption 8).
- The loosened zod type is additive at compile time: `createLocalExecutor` already casts args to `QuestionArgs`, and `TOOLS[].inputSchema` is typed `z.ZodTypeAny`, so no production consumer breaks and no three-step removal is required (Assumption 4).

## Preserved behavior

1. A relayed remote call with invalid arguments opens no panel and must not claim its call id; `src/remote/mcp-relay.test.ts` "refuses $label without registering and lets a later valid call with the same id register". Its `an unknown kind` row changes its expected text to the new `invalidKind` wording, and a new `choose` row with an invalid option object is added to the same table. The refusal-without-claiming behavior is unchanged.

## Assumptions

1. `src/mcp/question-tool.ts:28` defines `validateQuestionArgs(args)` and `:31` checks `question.trim() === ''`. Quote: `if (typeof question !== 'string' || question.trim() === '')`.
2. `src/mcp/tools.ts:15` types the tool's options as `options: z.array(z.string()).optional()`, so an object element is rejected by the SDK before `validateQuestionArgs` runs. Quote: `options: z.array(z.string()).optional()`.
3. `src/mcp/tools.ts:11` builds the schema with `z.object({ tab, kind, question, options })` and declares no `defaultOption` key. Quote: `export const questionInputSchema = z.object({`.
4. `src/mcp/executor.ts:21` destructures only `{ tab: requested, kind, question, options }` and `:28` passes `{ tab: label, kind, question, options }` to `register`. Quote: `const { tab: requested, kind, question, options } = args as QuestionArgs;`.
5. `src/remote/mcp-relay.ts:20` validates relayed calls with `validateQuestionArgs(args as Record<string, unknown>)` on raw JSON with no zod pass. Quote: `validateQuestionArgs(args as Record<string, unknown>)`.
6. `src/mcp/handler.test.ts:67` holds a table of exact error texts including `QUESTION_ERROR.missingOptions`; the `registerTool` mock does not run zod, so a schema-row test must parse with `questionInputSchema` directly. Quote: `message: QUESTION_ERROR.missingOptions`.
7. `src/mcp/question-tool.test.ts:7` and `src/remote/mcp-relay.test.ts:234` assert the literal `'kind must be "ask" or "approve".'`. Quote: `'kind must be "ask" or "approve".'`.
8. `src/mcp/handler.ts:22` calls `validateQuestionArgs(args as Record<string, unknown>)` on the same raw args the schema accepted, so loosening the schema does not require a handler edit. Quote: `const validated = validateQuestionArgs(args as Record<string, unknown>);`.
9. `src/mcp/tools.ts:21` types the definition's schema as `z.ZodTypeAny`, so widening the inferred `options` type does not break the `TOOLS` array. Quote: `inputSchema: z.ZodTypeAny;`.

## Existing functionality

1. `src/mcp/question-tool.ts:28` provides `validateQuestionArgs`, the single validator used by both the handler and the relay; extending it covers both paths with no edit to either.
2. `src/shared/question-choice.ts` provides `validateChoiceRequest`, the shared choice normalizer.
3. `src/mcp/tools.ts:11` provides `questionInputSchema`, the one schema both local and SDK paths use.
4. `src/mcp/executor.ts:19` provides `createLocalExecutor`, the single place that hands parsed args to `register`.
5. `src/mcp/question-tool.ts:3` provides `QUESTION_ERROR`, the catalogue extended with `invalidChoice`.

## Implementation steps

1. In `src/mcp/question-tool.ts`, accept `choose`, extend `QuestionArgs`, delegate choice calls to `validateChoiceRequest` ahead of the empty-question check, update `invalidKind`, and add `invalidChoice`. Keep the `approve` options check and `noTab` text unchanged. Build and prove green with `$janissary/scripts/run.mjs check-diff`.
2. In `src/mcp/tools.ts`, apply the two zod changes and rewrite the tool description per Design decisions. Keep `tab`, `kind`, and `question` as `z.string()`. Build and prove green with `$janissary/scripts/run.mjs check-diff`.
3. In `src/mcp/executor.ts`, pass `choices` and `defaultOption` into `register`. Build and prove green with `$janissary/scripts/run.mjs check-diff`.
4. Update the tests: `src/mcp/question-tool.test.ts` with a valid `choose` call using objects and `defaultOption`, and each invalid choice input (bare string, non-array options, blank question, non-string default) returning `Invalid choice question.`, plus the new `invalidKind` text; `src/mcp/handler.test.ts` with a row that parses directly through `questionInputSchema` to assert an object `options` list is accepted and `defaultOption` survives, and a `choose` row mapping to `Invalid choice question.`; `src/mcp/executor.test.ts` with `choices` and `defaultOption` reaching `register`; and `src/remote/mcp-relay.test.ts` with a `choose` row in the refusal table and the updated `an unknown kind` text. Build and prove green with `$janissary/scripts/run.mjs check-diff`.

Every step is green at its own commit.

## UI design

1. No user-visible surface changes. The tool description in `src/mcp/tools.ts` is prose an agent harness reads, not a panel; its wording must match the accepted shape.

## Tests

- `src/mcp/question-tool.test.ts`: requirements 1, 2, 3, 4, 5 and 6, plus the new `invalidKind` text.
- `src/mcp/handler.test.ts`: requirement 4 on the schema path and the schema-shape assertion; requirement 7 via the retained string schemas.
- `src/remote/mcp-relay.test.ts`: requirement 4 on the relay path and Preserved 15.
- `src/mcp/executor.test.ts`: requirements 2 and 3 reaching `register`.
- Existing tests that pin old error strings are updated in the same step; no test is left failing for a later subplan.

## Out of scope

- Command parsing, the primer, and usage text, which belong to `single-select-multiple-choice-question-8-command-parsing.md`.
- Role grants and documentation, which belong to `single-select-multiple-choice-question-10-inventory-and-docs.md`.
- Changing the SDK's schema error for a non-string `tab`, `kind`, or `question`.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then call the local MCP endpoint with a `choose` question whose `options` are objects with descriptions and whose `defaultOption` exactly matches one label; confirm a panel opens with the description shown and the default selected. Repeat with a bare string in `options`, a blank question, and a non-string `defaultOption`; each must return `Invalid choice question.` and open no panel. Send the same malformed call over a relayed remote session and confirm the same text with no call id claimed. A different error text, a panel on invalid input, or a dropped `defaultOption` is a failure.
