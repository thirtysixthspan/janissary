# Add the shared choice-request validator

**Complexity: 4/10** — ~50 added lines, 9 requirements, 10 scenarios (p=4.95)

Source plan: `./product/plans/complete/single-select-multiple-choice-question.md`. Depends on `single-select-multiple-choice-question-3-protocol-and-shared-label.md` for `QuestionChoice` and `CUSTOM_ANSWER_LABEL`.

## Goal

Choice requests arrive from two places: the `question choose` command and the MCP `question` tool (local, far-side, and relayed). Both must accept the same shapes and reject the same malformed inputs with the same underlying rules. This subplan adds one pure server-side function that validates and normalizes a choice request, so the command and tool only have to map its single failure value to their own error text. Nothing calls it yet; callers land in later subplans.

## Requirements

1. "Reject the request as invalid and return usage or validation feedback" when option labels are duplicated. (requirement 11)
2. "Reject exact matches only; retain labels that differ in case or whitespace." (requirement 12)
3. "Reject it as invalid, with usage or validation feedback" for a blank or whitespace-only option label. (requirement 13)
4. "Reject it as invalid, with usage or validation feedback" for blank or whitespace-only question text. (requirement 14)
5. "Reject it as invalid; at least one listed option is required." (requirement 15)
6. Reject the request as invalid, with usage or validation feedback, if the default label does not exactly match an option. (requirement 22)
7. Reject the exact option label "Type your own answer" as reserved. (requirement 24)
8. "Reject empty or whitespace-only option descriptions as invalid." (requirement 27)
9. On success return the normalized `{ question, choices, defaultOption? }` with labels and descriptions kept verbatim; nothing is trimmed. (Design decisions)

## Design decisions

- Add `validateChoiceRequest` to `src/shared/question-choice.ts`, beside the constant from subplan 3. It takes the question text, the candidate choice list, and an optional default, and returns the normalized value on success or `undefined` on any failure. Use `undefined` rather than an error-with-reason so neither caller can accidentally surface a rule: the command maps every failure to `QUESTION_USAGE` and the tool maps every failure to `Invalid choice question.` (Assumption 1, Assumption 2).
- Validate in this order: blank question text, empty list, per-entry blank label, reserved label, exact duplicate label, present-but-blank description, then a default that is not exactly one of the labels. Exact duplicate and default matching are strict string equality; labels differing only in case or whitespace are retained, not collapsed (Assumption 2).
- The module stays pure and imports nothing server-only, so the client can keep importing the constant over `@shared` without pulling server code into the bundle (Assumption 3).
- Return the `QuestionChoice` shape from `src/protocol/tab.ts` rather than redefining it locally, keeping one definition of the wire shape (Assumption 4).
- This validator is shared by construction; no second copy belongs in the command parser or the tool.

## Preserved behavior

None found. The subplan adds a new module and a new function that nothing calls yet; no existing behavior or test is touched.

## Assumptions

1. `src/question-command.ts:6` defines `QUESTION_USAGE` as the command's single usage string, and `src/mcp/question-tool.ts:3` defines `QUESTION_ERROR` with one text per failure; the source design decision states both map every validator failure to one text. Quote: `export const QUESTION_USAGE = [`.
2. The source design decisions state "Reject exact matches only; retain labels that differ in case or whitespace" and "Labels and descriptions are kept verbatim; nothing is trimmed." Quote: `Reject exact matches only`.
3. `src/shared/question-choice.ts` is created by `single-select-multiple-choice-question-3-protocol-and-shared-label.md` with no imports, so it is safe for the client bundle. Quote: `CUSTOM_ANSWER_LABEL`.
4. `src/protocol/tab.ts` exports `QuestionChoice` from subplan 3. Quote: `QuestionChoice`.
5. `src/mcp/question-tool.ts:28` defines `validateQuestionArgs` as the shared tool-side entry used by both the handler and the relay. Quote: `export function validateQuestionArgs(args: Record<string, unknown>)`.
6. `src/mcp/question-tool.ts:22` uses `undefined` as the failure value for its option reader, so `validateChoiceRequest` returning `undefined` on failure follows the existing convention. Quote: `function readOptions(options: unknown): { options?: string[] } | undefined`.

## Existing functionality

1. `src/shared/question-choice.ts` supplies the reserved-label constant the validator checks against.
2. `src/protocol/tab.ts` supplies the `QuestionChoice` shape the validator returns.
3. `src/question-command.ts:6` supplies `QUESTION_USAGE`, the single usage text the future command caller maps failures to.
4. `src/mcp/question-tool.ts:3` supplies `QUESTION_ERROR`, the error catalogue the future tool caller extends with `Invalid choice question.`.

## Implementation steps

1. In `src/shared/question-choice.ts`, add the exported `validateChoiceRequest` function and the failure value it returns. Follow Requirements and Design decisions exactly, including validation order and verbatim preservation; describe the contract in prose rather than adding a pasteable implementation. Build and prove green with `$janissary/scripts/run.mjs check-diff`.
2. Add `src/shared/question-choice.test.ts` with one case per acceptance and rejection rule: a valid list with descriptions and a default, blank question, empty list, blank label, reserved label, exact duplicate, case- and whitespace-differing labels retained, blank description, and a default that does not exactly match. Assert the success value keeps labels and descriptions verbatim. Build and prove green with `$janissary/scripts/run.mjs check-diff`.
3. Confirm no other file imports the new function yet; the command and tool callers arrive in `single-select-multiple-choice-question-8-command-parsing.md` and `single-select-multiple-choice-question-9-mcp-tool-and-executor.md`. Confirm the module has no server-only imports and remains `@shared`-safe. Build and prove green with `$janissary/scripts/run.mjs check-diff`.

Every step is green at its own commit and introduces no dangling reference.

## UI design

1. No user-visible surface changes. This is a pure validation module; the error text a person sees is produced by the command and tool callers in later subplans.

## Tests

- `src/shared/question-choice.test.ts` (new): requirements 1 through 9, one case per rule plus the verbatim-preservation assertion.
- Existing question-command, question-tool, handler, and relay tests stay green; the validator is not yet wired into them.

## Out of scope

- Mapping validator failure to `QUESTION_USAGE` or `Invalid choice question.`, which belongs to the command and tool callers.
- Command grammar flags (`--default`, `--description`, `--option`) and the MCP zod schema.
- Changing `validateQuestionArgs` or any existing error string.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then read `src/shared/question-choice.ts` and confirm every rule in Requirements appears once, that comparisons for duplicates and defaults are exact string matches, that labels and descriptions are never trimmed, and that the module has no imports. Read `src/shared/question-choice.test.ts` and confirm there is a named case for each rejection and that the case/whitespace pair is accepted. A trimmed label, a collapsed duplicate, a reason-bearing failure, or a missing case is a failure.
