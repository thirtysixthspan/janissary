# Role based ACP tool filtering

**Complexity: 4/10** — resolves named role settings per prompt and filters the existing tool table while preserving refusal feedback for recognized but ungranted commands.

## Goal

Make `ask` prompts use the current `ask` role's native-command grants and model fallback settings. A role with no grants receives no native tool table.

## Decisions and dependencies

- Depends on `role-native-command-catalog-and-grants.md`; the role reader must observe the missing-role versus existing-role-with-missing-field distinction.
- Preserve current model fallback: absent role uses built-in defaults; an existing role with no enabled entries falls back to built-in models. Its commands still come from that role and default to none.
- Existing roles files without a `commands` field intentionally lose native tool access on ask; do not migrate or silently restore default grants. Strings that are stored but are not one of the nine native commands remain visible in roles but never become an executable grant.
- Read role settings fresh for each prompt. A roles-file change affects the next prompt without replacing the current conversation.
- Keep `withoutTools` as a tab-wide override that builds no tools or tool primer for any role.
- Design `createAcpToolTable` and its runner to accept the role name plus that role's grants, even though this subplan first wires the table only to `ask`. Refusal text must therefore be generic by role: `Command not allowed for role "<role>": <subcommand>.` A tool with no granted subcommand is omitted entirely, so its primer is absent and none of its command lines are recognized. A tool with at least one grant keeps its existing primer and recognizer, then the combined tool primer ends with `Only these commands are allowed: <listed subcommands, comma-separated>.` Match a reply's leading words against the native vocabulary to identify its exact subcommand. A known command from a kept tool but an ungranted subcommand returns the refusal to the model instead of executing it.
- Every such refusal is still a normal tool step: record it in the transcript and connection tab and count it toward the existing eight-step cap, so it cannot create an unbounded refusal loop.
- Preserve the existing tool order, last-recognized-line extraction, eight-step cap, transcript recording, and tool execution behavior for granted commands.

## Existing code to reuse

- `src/acp/ask-role.ts` resolves model entries and fallback behavior.
- `src/acp/tool-table.ts` owns the existing tool definitions, primers, runner, and extractor.
- `src/acp/run-prompt.ts` reads the no-tools override and builds each prompt's tool table.
- `src/database/primer.ts`, `src/browser/command.ts`, and `src/question-command.ts` own unchanged primers and line recognizers.

## Proposed changes

- Generalize the role lookup in `src/acp/ask-role.ts` to return named role entries and command grants, including built-in ask/tell defaults for absent roles.
- Extend `createAcpToolTable`, `toolPrimer`, and `toolRunner` in `src/acp/tool-table.ts` to filter by grants, append the allow-list line, identify a known subcommand from the leading command words, and refuse ungranted commands.
- Pass the ask role's fresh grants from `src/acp/run-prompt.ts`, respecting `runtime.acpWithoutTools`.
- Update `product/specs/acp.md` for role-based grants, prompt-time reads, omitted tools, the refusal line, and the no-tools override.

## Tests

- `src/acp/ask-role.test.ts`: named role lookup, absent-role defaults, and empty-model fallback without substituting the role's own commands.
- `src/acp/tool-table.test.ts`: granted subsets, omitted tools, primer text, refused ungranted command that belongs to an included tool with the generic role wording, and empty grants. Add or extend a tool-loop integration test to prove the refusal is recorded as a tool step and consumes one of the eight steps.
- `src/acp/manager.test.ts` or a focused run-prompt test: changing role grants applies on the next prompt.
- Keep existing ACP tool-loop tests for extraction and the eight-step cap passing.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` after implementation changes and tests.
- Confirm a missing `commands` field on an existing ask role produces no tool table, while an absent ask role uses built-in ask defaults.

## Out of scope

- The `tell` command and tell-specific prompt instruction.
- Narrowing arguments within a granted subcommand.
- Migrating existing roles files or changing the database, browser, and question recognizers.
