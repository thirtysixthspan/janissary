# Role based ACP tool filtering

**Complexity: 5/10** — per-prompt role snapshots must drive model selection and three coordinated tool-loop surfaces: the primer, command execution, and reply extraction.

## Goal

Make `ask` prompts use the current `ask` role's native-command grants while preserving its existing model selection and fallback behavior. A role with no native grants receives no ACP tool table.

## Decisions and dependencies

- Depends on completed `product/plans/complete/role-native-command-catalog-and-grants.md`, which defines `Role.commands`, `NATIVE_ACP_COMMANDS`, `nativeCommandTool`, and `DEFAULT_ROLES`. Use `nativeCommandTool` for tool ownership; do not repeat its owner map.
- Replace or generalize `askRoleEntries` in `src/acp/ask-role.ts:24-29` (`askRoleEntries`) with a named-role settings lookup that returns that role's name, model entries, and native-command grants. Find names using the current trimmed, case-insensitive comparison in `src/acp/ask-role.ts:12-14` (`askRole`). If the requested role is absent from the effective file, use the matching built-in role from `DEFAULT_ROLES`; if no built-in role has that name, return empty entries and grants. If an existing role's decoded `entries` list is empty, use the built-in entries but retain that existing role's command grants, including an empty list. A missing `commands` field already decodes to `[]`; never substitute the built-in grants for an existing role. The fallback happens before enabled-model filtering, so a nonempty stored list whose models are all disabled does not fall back to built-in models.
- Read settings once when each logical `ask` prompt begins and carry that snapshot through its model attempts in `AcpPendingPrompt`/`Attempt`. A roles-file edit affects the next prompt, not a running prompt or a later model retry for the same prompt. The new lookup remains read-only and uses `readRolesFile(..., { create: false })`.
- Generalize `createAcpToolTable` and `toolRunner` to accept a role name and that role's grant list, even though this plan wires them only to `ask`. The allow-list contains only distinct recognized native grants, in `NATIVE_ACP_COMMANDS` order; unknown stored strings never activate a tool or appear in instructions. Trailing arguments remain unrestricted.
- Filter the existing tool table by ownership: omit any browser, question, or database tool with no grant for that owner. Keep the existing table order and each included tool's full primer and command-line recognizer. The combined tool primer ends with `Only these commands are allowed: <native grants, comma-separated>.` A zero-grant role yields an empty tool table and no tool primer or recognized native command.
- A recognized native command owned by an included tool but absent from the grants must return `Command not allowed for role "<role>": <subcommand>.` to the model and must not call its tool. Use the matched native command name, excluding trailing arguments, in `<subcommand>`. Return the refusal as a normal tool result rather than throwing so the loop records and counts it.
- Keep `withoutTools` as a tab-wide override: it builds no table or tool instructions for any role. Keep the database entry last in the table, but check every extracted command against the native vocabulary and grants before execution so its catch-all match cannot bypass filtering. Unknown command lines are not extracted; preserve the last-recognized-line extraction, eight-step cap, transcript recording, and execution of granted commands.
- Use `nativeCommandName` (added beside `nativeCommandTool` in `src/acp/native-commands.ts`) to identify the exact native prefix of an emitted command. It shares the catalog matching logic, accepts any trailing arguments, and returns no match for unknown subcommands.

## Existing code to reuse

| Location | Existing behavior |
| --- | --- |
| `src/acp/ask-role.ts:12-29` (`askRole`, `defaultAskEntries`, and `askRoleEntries`) | Reads the effective roles file without creating it and defines the current absent/empty-entry model fallback. Extend this for named settings without changing when model fallback occurs. |
| `src/plugins/roles/shared.ts:3-13` (`NATIVE_ACP_COMMANDS`) and `src/acp/native-commands.ts:5-19` (`nativeCommandTool` and `isNativeCommand`) | Own the ordered vocabulary and tool-owner mapping. Reuse them for filtering and matched-command parsing. |
| `src/acp/tool-table.ts:28-48` (`createAcpToolTable`), `:52-53` (`toolPrimer`), `:58-64` (`toolRunner`), and `:67-69` (`toolExtractor`) | Own the ordered tool definitions and the three coordinated loop surfaces. Filter these definitions instead of duplicating their runners or recognizers. |
| `src/acp/run-prompt.ts:15-54` (`runCorePrompt`) | Builds the table, primer, runner, and extractor once for the pending prompt; applies `runtime.acpWithoutTools`. Feed it the pending role snapshot. |
| `src/acp/manager.ts:19-30` (`Attempt` and `AcpManager`), `:65-104` (`run` and `attempt`), and `:113-125` (`settleAttempt`) | Captures the prompt model queue and retries the same logical prompt after a model failure. Extend the prompt settings test seam and carry grants unchanged through retries. |
| `src/acp/prompt-state.ts:3-15` (`AcpPendingPrompt`) | Holds the state shared by a prompt and its model attempt. Add the role name and immutable grant snapshot here. |
| `src/acp/loop.ts:48-73` (`extractCommand`, `runCommand`, and step handling) | Extracts a command, executes it, records it through handlers, and increments the step for every normal result, including a refusal string. |
| `src/database/primer.ts:8-20` (`DB_PRIMER` and `isDatabaseCommandLine`), `src/browser/command.ts:102-104` (`isBrowserCommandLine` and `BROWSER_PRIMER`), and `src/question-command.ts:56-67` (`isQuestionCommandLine` and `QUESTION_PRIMER`) | Provide the existing full primers and recognizers; leave their command grammars and execution behavior unchanged. |

## Proposed changes

- Add a named-role settings type and lookup in `src/acp/ask-role.ts`. Preserve `askRoleEntries` behavior for existing callers or update its callers and tests in one change. Clone returned entries and grants so a prompt snapshot cannot be mutated by a later roles-file read.
- Extend the native-command helper with `nativeCommandName` and tests for each vocabulary prefix, trailing arguments, surrounding whitespace, case-insensitive command words matching the existing recognizers, and unknown subcommands. Return the canonical lower-case vocabulary value so grant comparison is exact and independent of emitted casing.
- Extend `createAcpToolTable`, `toolPrimer`, and `toolRunner` in `src/acp/tool-table.ts` to receive the role name and grants. Include a tool when at least one distinct native grant belongs to it; append the ordered allow-list after included primers; and return the specified refusal for recognized but ungranted subcommands without invoking a runner. Never execute an unknown subcommand through the database catch-all; the table stays ordered for its existing first-match behavior, but every executed command must first match a native vocabulary entry and the role grants.
- In `AcpManager.run`, capture one role settings snapshot before constructing the model queue. Store its role name and command grants on the attempt and pending prompt so each retry gets the same policy. Keep `start()` using the same model-entry fallback rules. In `runCorePrompt`, pass the pending snapshot to the filtered table; when `acpWithoutTools` is true, continue to pass an empty table.
- Update `product/specs/acp.md` for per-prompt role grants, absent-role defaults versus existing empty grants, model fallback boundaries, omitted tools, the allow-list instruction, refusal text, and the no-tools override.

## Tests

- `src/acp/ask-role.test.ts`: absent `ask` uses built-in entries and grants; an existing `ask` with missing or empty commands has no grants; an existing role with empty entries uses built-in model entries but its own grants; nonempty entries whose models are all disabled do not receive built-in model fallback; repeated reads observe file changes.
- `src/acp/native-commands.test.ts`: verify `nativeCommandName` for all nine prefixes, trailing arguments, and unknown commands, while retaining owner and membership coverage.
- `src/acp/tool-table.test.ts`: verify filtered tool membership and unchanged order, complete omission of ungranted tools, the final allow-list order and duplicate/unknown filtering, allowed commands with trailing arguments, and the exact generic refusal for a known ungranted command owned by an included tool. Assert the refused tool runner is not called and the line still extracts as a command.
- `src/acp/manager.test.ts`: change the injected role settings between completed prompts and confirm the next prompt's primer, extractor, and runner reflect the new grants, while a model retry within one prompt uses the original snapshot. Retain the `withoutTools` tests.
- `src/acp/plugin-session.test.ts`: with a restricted role, emit a recognized but ungranted command and verify its refusal appears as a tool result in the transcript and ACP record. Verify refusals consume one of the eight steps and the loop still stops at the existing cap.
- Keep the existing tool ordering, last-command extraction, async question command, tool-less session, and eight-step loop tests passing.

## Verification

- Run `./scripts/run.mjs check-diff` after implementation changes and tests.
- Manual check using isolated role files: with no `ask` role, confirm the built-in ask grants and tools are present. With an existing `ask` role whose command list is empty or missing, confirm no native tools are offered or recognized. With one grant, confirm its tool runs, another command on that same tool returns the exact refusal without execution, and commands owned by omitted tools are not extracted. Change the file between prompts and confirm the next prompt sees the new grants; confirm `withoutTools` still removes all tool instructions.

## Out of scope

- The `tell` command and its prompt instruction or session lifecycle.
- Narrowing arguments within an allowed subcommand.
- Migrating existing roles files or changing the database, browser, and question recognizers.
