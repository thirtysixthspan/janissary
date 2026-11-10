# Tell role agents they have no built-in tools

**Complexity: 3/10** — ~8 added production lines in 2 files (`internal-tools.ts`, `run-prompt.ts`), 4 requirements, 7 test scenarios (p=4.46); the work is mostly updating exact-equality primer assertions and three spec/doc sentences.

## Goal

The role primer tells the model it has no built-in tools, so it reaches for the granted Janissary commands (or answers in prose) instead of trying tools that layer one (subplan 4) has turned off. Part of `product/plans/complete/deny-internal-tools-for-role-acp-connections.md` (subplan 5 of 6).

## Design decisions and dependencies

Builds on subplan 4 (`src/acp/internal-tools.ts`, which this subplan extends with the two primer-line constants). It does not need subplans 1–3 directly, and it does not wait for subplan 6 (`deny-internal-tools-6-remote-session-meta.md`).

- With at least one command available after intersecting grants and agent access, the line `You have no built-in tools; use only the commands listed here.` follows the allow-list line.
- With none available — no grants, every granted command excluded, or a session a plugin started with `withoutTools` — the line `You have no tools; answer in prose.` goes where the allow-list line would be, immediately after any group primers that remain, so `withoutTools` sessions such as the launcher summarizer receive it too.
- "Available" means `tools.length > 0 && allowedCommands.length > 0`, both already computed in `runCorePrompt` (`src/acp/run-prompt.ts:29` `const tools = runtime.acpWithoutTools === true ? [] : …` and `:33` `const allowedCommands = NATIVE_ACP_COMMANDS.filter(…)`). `allowedCommands` alone is not enough: a `withoutTools` session has an empty table but a nonempty `allowedCommands` when its role grants commands, and it must get the no-tools line. A role with no recognized grants gets no tool table and no group primers (`toolPrimer` returns `''`), so its primer starts with the no-tools line.
- The `tell` instruction and the Markdown instruction keep their positions after the tool-availability line, so the order is: group primers, allow-list line (if any), one of the two lines, `TELL_INSTRUCTION` (tell only), `MARKDOWN_INSTRUCTION`, joined by blank lines (`'\n\n'`) as today.
- The module `src/acp/internal-tools.ts` exports the two lines as constants named `NO_BUILTIN_TOOLS_LINE` and `NO_TOOLS_LINE`; `run-prompt.ts` imports them from `./internal-tools.js`. The text is exactly as quoted above.
- Remote sessions get the same line. A `claude` role session hosted on a remote machine still has its built-in tools until subplan 6 lands (`product/specs/acp.md` "Role connections deny every internal tool", `help/ask.md`, `help/tell.md`); the line is a steer, not the guarantee, and layer two still denies every permission request there. No caveat is added to the primer.
- The Janissary command gate is unchanged: the allow-list line, group primers, and the per-call re-check behave exactly as before. `toolPrimer` in `src/acp/tool-table.ts` is not modified.
- No opt-out in this version: every `ask` and `tell` prompt carries exactly one of the two lines.

## What already exists (reuse, don't rebuild)

| Existing | Where | Use |
| --- | --- | --- |
| Role primer assembly | `src/acp/run-prompt.ts:54` (`primer: [toolPrimer(tools, allowedCommands), request.role === 'tell' ? TELL_INSTRUCTION : '', MARKDOWN_INSTRUCTION]` then `.filter(Boolean).join('\n\n')`) | Where the line is added. `tools` and `allowedCommands` are already computed above it. |
| Group primers and allow-list line | `src/acp/tool-table.ts` `toolPrimer` | Unchanged; returns `''` for an empty table, group primers alone for an empty allow-list. The new line follows its output. |
| Policy module | `src/acp/internal-tools.ts` (subplan 4, 82 lines) | Home of the two constants. |
| Restated-literal test pattern | `src/acp/run-prompt.test.ts:16` (`const TELL_INSTRUCTION = '…'`), `src/acp/manager.test.ts:211` (Markdown instruction written out) | Tests pin the two lines' text the same way. |
| Primer tests | `src/acp/run-prompt.test.ts` (`primer()` helper, default grant `['db sqlite query']`, `commands` and `settings` options), `src/acp/manager.test.ts` | Hold the assertions to update. |

## Proposed changes

- `src/acp/internal-tools.ts`: export `NO_BUILTIN_TOOLS_LINE` and `NO_TOOLS_LINE` with the text above, under a one-line comment saying they are the role primer's tool-availability lines. The file stays under 90 lines.
- `src/acp/run-prompt.ts`: in the `primer:` array, insert a second element between `toolPrimer(tools, allowedCommands)` and the tell-instruction element: `NO_BUILTIN_TOOLS_LINE` when available (as defined above), `NO_TOOLS_LINE` otherwise. Keep the existing `.filter(Boolean).join('\n\n')`, which already drops the empty `toolPrimer` output and the empty tell slot for `ask`. Compute the available flag as a named local beside `allowedCommands` rather than inline, so the array stays one readable line. The file is 95 lines and stays well under the limit.

## Tests

Tests write both lines' text out as local constants (the `TELL_INSTRUCTION` pattern at `run-prompt.test.ts:16`) rather than importing them, so a wording change fails a test.

- `src/acp/run-prompt.test.ts`:
  - Update "places the tell instruction after available tool text and before Markdown" to `database primer`, `Only these commands are allowed: db sqlite query.`, `NO_BUILTIN_TOOLS_LINE`, `TELL_INSTRUCTION`, `MARKDOWN_INSTRUCTION`.
  - Update "keeps the tell instruction when the tab-wide no-tools override removes tool text" to `NO_TOOLS_LINE`, `TELL_INSTRUCTION`, `MARKDOWN_INSTRUCTION`; update "omits the tell instruction from ask when the tab-wide no-tools override is set" to `NO_TOOLS_LINE`, `MARKDOWN_INSTRUCTION`. These cover `withoutTools` with a nonempty grant (the helper's default), which is the case `allowedCommands` alone would get wrong.
  - Update the `it.each` "keeps the group primer alone when the %s intersection is empty" (disabled and agent-off) to `BROWSER_PRIMER`, `NO_TOOLS_LINE`, `MARKDOWN_INSTRUCTION`, and keep its `not.toContain('Only these commands are allowed')`.
  - Add: a role with no grants (`commands: []`) gives exactly `NO_TOOLS_LINE`, `MARKDOWN_INSTRUCTION`.
  - Add `not.toContain(NO_TOOLS_LINE)` / `toContain(NO_BUILTIN_TOOLS_LINE)` to "excludes an agent-off command from the allow-list but keeps its owner primer", and in "keeps the tell instruction after a filtered allow-list" assert the allow-list line precedes `NO_BUILTIN_TOOLS_LINE`, which precedes `TELL_INSTRUCTION`.
  - "does not give the ask role the tell instruction" passes unchanged.
- `src/acp/manager.test.ts`:
  - "hands the loop no tools at all for a session started without them" (`:211`) now expects exactly `NO_TOOLS_LINE`, a blank line, then the Markdown instruction; update the comment above it (`:201`, "an empty table means the primer grows no tool text") to say the primer carries only the no-tools line.
  - "keeps one role grant snapshot through retries and reads the next prompt afresh": `first` and `retry` (a `question ask` grant that is agent-off) also contain `NO_TOOLS_LINE`; `next` (containing `Only these commands are allowed: db sqlite query.`) also contains `NO_BUILTIN_TOOLS_LINE`. The existing `not.toContain('Only these commands are allowed')` assertions keep passing.
  - "keeps the no-tools override in force for both role prompts" (`:599`): each primer also contains `NO_TOOLS_LINE`.
- Unchanged and passing: `src/acp/tool-table.test.ts` (`toolPrimer` is not modified), `src/native-commands/feature.integration.test.ts` (it finds the allow-list line by prefix), `src/acp/plugin-session.test.ts` and `src/acp/record-feed.test.ts` (no primer assertions), `src/conversations/manager.test.ts` (conversation primer, out of scope).

## Spec and docs updates

- `product/specs/acp.md`:
  - The allow-list paragraph (starts "Each user prompt receives primers for every tool owner granted…"): add the two lines and where each goes, and change "A role with no recognized grants receives no tool table or tool primer." to say it receives no tool table or group primers and its primer starts with the no-tools line.
  - The `withoutTools` paragraph (starts "A session a plugin started with `withoutTools` builds no tool table at all"): "Its primer carries no tool text" becomes its primer carries only the no-tools line.
  - The "Commands" paragraph on `tell`: the instruction comes "after the tool primer and before the Markdown instruction" becomes after the tool primer and its tool-availability line and before the Markdown instruction.
  This is the "primer lines" part of the source plan's `acp.md` bullet; the two-layer, denial-activity, and bundled-adapter parts are already on the branch.
- `documentation/developer-documentation/tab-plugins.md`, the `startAcp(request?)` bullet: "the primer grows no tool text" becomes "the primer tells the model it has no tools". The read-only-session paragraph ("A session your plugin only reads from…") makes no primer claim and is unchanged. Not listed in the source plan; required by architecture principle 10 because this change makes the sentence false.
- `help/ask.md`, `help/tell.md`, `documentation/user-documentation/advanced-agents/acp-agent.md`, and `product/specs/markdown-rendering.md` need no change: they already say the agent has no built-in tools, and none describes the primer's order.

## Verification

`$janissary/scripts/run.mjs check-diff` green. Manually: after `ask reset`, run `ask what tools can you use?` and confirm the answer says it has no built-in tools and names only the granted native commands; remove every grant from the `ask` role in the roles tab, `ask reset`, ask the same question, and confirm it answers in prose that it has no tools; run the launcher's summarizer once and confirm it still returns a prose summary.

## Out of scope

- Changing `toolPrimer`, the allow-list wording, group primers, or the per-command gate.
- Primers for monitor, conversation, editor persona, or autonomous `agent` sessions.
- Any opt-out of the lines.
- Carrying `sessionMeta` to remote hosts (subplan 6).
