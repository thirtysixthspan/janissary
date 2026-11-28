# Parse the question choose command and publish its grammar

**Complexity: 5/10** — ~70 added lines, 8 requirements, 12 scenarios (p=5.48)

Source plan: `./product/plans/complete/single-select-multiple-choice-question.md`. Depends on `single-select-multiple-choice-question-6-choice-validator.md` for `validateChoiceRequest` and on `single-select-multiple-choice-question-7-questions-carry-through.md` so `QuestionRequest` accepts the parsed `choices`.

## Goal

A person or agent should be able to type `question choose "<question>" [--default <label>] <option> [--description <text>] ...` and get a pending choice question, with malformed forms returning usage text instead of opening a panel. This subplan adds the pure parser, the usage and primer text, the command matchers, and the sample that keeps command shadowing checks honest. Tool-side input handling lands separately.

## Requirements

1. Provide `question choose "<question>" <option> [<option> …]` and a matching question-tool kind — this subplan delivers the command half; the tool kind arrives in `single-select-multiple-choice-question-9-mcp-tool-and-executor.md`. (requirement 1)
2. "Use a repeatable `--description` argument immediately after the option it describes in the command." (requirement 19)
3. Identify the default by its exact option label, using `--default` in the command. (requirement 21)
4. "Return updated usage text for malformed commands and a validation error for tool calls." — the command half returns `QUESTION_USAGE`. (requirement 25)
5. "Support an `--option` flag to introduce any command option label explicitly, including labels matching flags." (requirement 26)
6. "Place `--default` immediately after the question, before the option list." (requirement 32)
7. "Reject repeated `--default` or multiple `--description` arguments for one option and return usage text." (requirement 33)
8. Add the usage line `question choose "<question>" [--default <label>] <option> [--description <text>] ...` alongside the existing lines. (requirement 37)

## Design decisions

- Add `parseChooseCommand(tokens)` in `src/question-command.ts` beside `parseQuestionCommand`, which delegates to it when `tokens[1]` is `choose`. It turns the tokens after `question choose` into `{ kind: 'choose', question, choices, defaultOption? }` through `validateChoiceRequest`, or into `{ error: QUESTION_USAGE }` (Assumption 1).
- The grammar is decided against the existing tokenizer `words`, which drops quoting: quoting a flag does not escape it, so `"--default"` is the flag `--default`. `--option` is the only way to pass a label that looks like a flag. The token immediately after `--default`, `--description`, or `--option` is taken literally as that flag's value even when it starts with `--`. Any other bare token starting with `--` is usage, never a label; a missing flag value is usage (Assumption 2).
- `--default` is valid only as the token right after the question; a `--default` elsewhere or a second one is usage. `--description` before any option or a second `--description` for the same option is usage. Descriptions attach to the option immediately before them.
- Add the usage line from requirement 37 as the third line of `QUESTION_USAGE`. Add a matching syntax line to `QUESTION_PRIMER` plus one `commandExample` for `choose` that uses both `--default` and `--description`, keeping one example per form.
- Extend both matchers to `(ask|approve|choose)` and add a `question choose 1` sample so the shadowing check in `src/commands.test.ts` still sees a representative command (Assumption 3).
- `src/question-command.ts` is 67 lines today; the parser fits under the 200-line limit. If it would exceed it, extract the grammar into its own module in the same step rather than compacting code.

## Preserved behavior

1. Server-side approve validation refuses a label that was not offered and must not resolve the question with it; `src/commands/question.test.ts` "registers a pending approve question validated against the supplied options". The `approve` parser and dispatch path are unchanged; the matchers only gain a third alternative.

## Assumptions

1. `src/question-command.ts:17` tokenizes with `words`, which returns unquoted strings via `match[1] ?? match[2] ?? match[3]` and keeps no record of which tokens were quoted. Quote: `tokens.push(match[1]?.replaceAll`.
2. `src/question-command.ts:29` defines `parseQuestionCommand` with the pure-parser shape `ParsedQuestion | { error: string }`. Quote: `export function parseQuestionCommand(input: string): ParsedQuestion | { error: string }`.
3. `src/commands/question.ts:29` holds the command matcher `/^question\s+(ask|approve)\b/i` and `:30` holds `samples: ['question ask hello', 'question approve 1']`. Quote: `match: (command_) => /^question\s+(ask|approve)\b/i.test(command_)`.
4. `src/question-command.ts:55` builds `QUESTION_PRIMER` with two `commandExample` rows, and `src/question-command.test.ts:56` pins that count. Quote: `expect(QUESTION_PRIMER.split('\n').filter((line) => line === '```janissary')).toHaveLength(2);`.
5. `src/question-command.ts:41` holds the ACP reply-line matcher `isQuestionCommandLine`. Quote: `return /^question\s+(ask|approve)\b/i.test(line);`.

## Existing functionality

1. `src/question-command.ts:17` provides `words`, the tokenizer whose quoting behavior defines the grammar.
2. `src/question-command.ts:29` provides `parseQuestionCommand`, the pure parser the new one sits beside and delegates from.
3. `src/shared/question-choice.ts` provides `validateChoiceRequest`, which normalizes the parsed list and reports a single failure value.
4. `src/commands/question.ts:27` provides the one command definition whose matcher and samples gain `choose`.
5. `src/acp/command-example.ts` provides `commandExample`, used to add the primer example without inventing a format.

## Implementation steps

1. In `src/question-command.ts`, add `parseChooseCommand(tokens)` with the grammar in Design decisions, calling `validateChoiceRequest` for the normalized result and returning `{ error: QUESTION_USAGE }` for every malformed form. Make `parseQuestionCommand` delegate when `tokens[1]` is `choose`. Add the third usage line and the primer syntax line plus one `commandExample` using `--default` and `--description`. Build and prove green with `$janissary/scripts/run.mjs check-diff`.
2. In `src/commands/question.ts`, extend the matcher to include `choose` and add the `question choose 1` sample, preserving order so the shadowing test still holds. Build and prove green with `$janissary/scripts/run.mjs check-diff`.
3. In `src/question-command.test.ts`, cover: choose parsing with and without `--default`; `--description` attached to the preceding option; `--option --default` producing a literal label; a quoted `"--default"` acting as the flag; an unknown `--foo` returning usage; each invalid form returning `QUESTION_USAGE`; labels differing only in case or whitespace retained; the `QUESTION_USAGE` line present; and the primer example count rising to 3. In `src/commands/question.test.ts`, add a `command.match` row for `question choose` and a case that registers a pending choice question. Build and prove green with `$janissary/scripts/run.mjs check-diff`.

Every step is green at its own commit and leaves the tree buildable without later cleanup.

## UI design

1. No user-visible surface changes beyond the panel a successfully parsed `question choose` opens; the panel itself comes from `single-select-multiple-choice-question-4-choice-form.md`. Malformed commands produce usage text on the command line or agent transcript, never a panel.

## Tests

- `src/question-command.test.ts`: requirements 2, 3, 5, 6, 7 and 8 plus requirement 1's command half, including the quoting and flag edge cases listed in Implementation step 3.
- `src/commands/question.test.ts`: requirement 1 dispatch and Preserved 12.
- `src/commands.test.ts`: keep the shadowing check green with the new sample.
- The primer count assertion moves from 2 to 3; update it in the same step.

## Out of scope

- MCP tool schema, `Invalid choice question.`, and executor wiring, which belong to `single-select-multiple-choice-question-9-mcp-tool-and-executor.md`.
- The `defaultOption` field-name decision and role inventory, which are later subplans.
- Changing approval parsing or the existing two usage lines.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then, in the running app, type `question choose "Release?" --default stable stable --description "Stable release" beta` on a tab's command line and confirm a choice panel opens with the default selected and the description shown. Type `question choose "Release?" stable stable` and confirm usage text is returned with no panel. Type `question choose "Release?" --option --default beta` and confirm a label literally named `--default` is offered. A panel on a malformed command, a missing description, or a flag treated as a label without `--option` is a failure.
