# Tell role agents they have no built-in tools

**Complexity: 2/10** — Two exported constants and a conditional line in the `primer:` array in `run-prompt.ts`, with several exact-equality primer assertions to update and two spec/doc passages to correct.

## Goal

The role primer tells the model it has no built-in tools, so it reaches for the granted Janissary commands (or answers in prose) instead of trying tools that layer one (subplan 4) has turned off. Part of `product/plans/ready/deny-internal-tools-for-role-acp-connections.md`.

## Design decisions and dependencies

Builds on subplan 4 (`src/acp/internal-tools.ts`, which this subplan extends with the two primer-line constants). It does not need subplans 1–3 directly.

- With at least one command available after intersecting grants and agent access, the line `You have no built-in tools; use only the commands listed here.` follows the allow-list line.
- With none available — no grants, every granted command excluded, or a session a plugin started with `withoutTools` — the line `You have no tools; answer in prose.` goes where the allow-list line would be, immediately after any group primers that remain, so `withoutTools` sessions such as the launcher summarizer receive it too.
- "Available" means the prompt has a tool table and a nonempty `allowedCommands`: a `withoutTools` session has an empty table even when its role grants commands, and an empty table gets the no-tools line. A role with no recognized grants gets no tool table and no group primers, so its primer starts with the no-tools line.
- The `tell` instruction and the Markdown instruction keep their positions after it.
- The module `src/acp/internal-tools.ts` exports the two primer lines as constants; `run-prompt.ts` imports them (with `.js` extensions).
- The Janissary command gate is unchanged: the allow-list line, group primers, and the per-call re-check behave exactly as before. `toolPrimer` in `src/acp/tool-table.ts` is not modified.
- No opt-out in this version: every `ask` and `tell` prompt carries one of the two lines.

## What already exists (reuse, don't rebuild)

| Existing | Where | Use |
| --- | --- | --- |
| Role primer assembly | `src/acp/run-prompt.ts` (the `primer:` array) | Where the line is added. `allowedCommands` and `tools` are already computed there. |
| Group primers and allow-list line | `src/acp/tool-table.ts` `toolPrimer` | Unchanged; the new line follows its output. |
| Policy module | `src/acp/internal-tools.ts` (subplan 4) | Home of the two constants. |
| Primer tests | `src/acp/run-prompt.test.ts` (`primer()` helper), `src/acp/manager.test.ts` | Hold the exact-equality assertions to update. |

## Proposed changes

- `src/acp/internal-tools.ts`: export `NO_BUILTIN_TOOLS_LINE = 'You have no built-in tools; use only the commands listed here.'` and `NO_TOOLS_LINE = 'You have no tools; answer in prose.'` (names may differ; the text may not).
- `src/acp/run-prompt.ts`: append the matching primer line when assembling the `primer:` array — after the allow-list line when `allowedCommands` is nonempty and the tool table is nonempty, after any group primers otherwise — i.e. `[toolPrimer(tools, allowedCommands), available ? NO_BUILTIN_TOOLS_LINE : NO_TOOLS_LINE, tellInstruction, MARKDOWN_INSTRUCTION].filter(Boolean).join('\n\n')`. The file is 95 lines and stays well under the limit.

## Tests

- `src/acp/run-prompt.test.ts`: the primer ends its tool section with the available-commands line (`database primer`, allow-list, `NO_BUILTIN_TOOLS_LINE`, then tell and Markdown); with none available after intersection (the disabled and agent-off `it.each` cases) the group primer is followed by `NO_TOOLS_LINE`; a `withoutTools` session gets `NO_TOOLS_LINE` first for both `ask` and `tell`; a role with no grants gets `NO_TOOLS_LINE` first; the `tell` instruction still follows the line and precedes Markdown. Update the existing exact-equality cases ("places the tell instruction…", "keeps the tell instruction when the tab-wide no-tools override…", "omits the tell instruction from ask…", "keeps the group primer alone…") to include the line.
- `src/acp/manager.test.ts`: the `withoutTools` case at "hands the loop no tools at all" now expects `NO_TOOLS_LINE` then the Markdown instruction; the existing assertions that no allow-list line appears for an empty grant keep passing, and those cases also contain `NO_TOOLS_LINE`; the granted case containing `Only these commands are allowed: db sqlite query.` also contains `NO_BUILTIN_TOOLS_LINE`.
- `src/acp/tool-table.test.ts`: unchanged and passing (`toolPrimer` is not modified).
- `src/native-commands/feature.integration.test.ts`: unchanged and passing (it finds the allow-list line by prefix).

## Spec and docs updates

- `product/specs/acp.md` "Autonomous tool loop": after the allow-list paragraph, the two primer lines and where each goes; in the `withoutTools` paragraph ("Its primer carries no tool text") say its primer carries only the no-tools line; in "Commands", the `tell` instruction comes after the tool primer and its tool-availability line and before the Markdown instruction. This is the "primer lines" part of the source plan's `acp.md` bullet.
- `documentation/developer-documentation/tab-plugins.md` (the `startAcp(request?)` bullet and the read-only-session paragraph): "the primer grows no tool text" becomes "the primer tells the model it has no tools". Not listed in the source plan; required by architecture principle 10 because this change makes the sentence false.

## Verification

`$janissary/scripts/run.mjs check-diff` green. Manually: after `ask reset`, run `ask what tools can you use?` and confirm the answer says it has no built-in tools and names only the granted native commands; remove every grant from the `ask` role in the roles tab, `ask reset`, ask the same question, and confirm it answers in prose that it has no tools; run the launcher's summarizer once and confirm it still returns a prose summary.

## Out of scope

- Changing `toolPrimer`, the allow-list wording, group primers, or the per-command gate.
- Primers for monitor, conversation, editor persona, or autonomous `agent` sessions.
- Any opt-out of the lines.
