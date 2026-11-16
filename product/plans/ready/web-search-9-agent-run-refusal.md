# Web search 9: refuse `web` lines in `agent` runs

**Complexity: 2/10** — ~4 added lines in 2 files, 4 requirements, 5 test scenarios, no new units (p=4.20)

The ninth slice of the `web search` feature (source plan: `./product/plans/complete/web-search.md`). It makes an `agent` run refuse any `janissary web …` line with `Agent: command not permitted: <command>.`, even when a skill grants `web`, the way it refuses `file glob` and the file mutations today. It lands before the typed `web` command (`./product/plans/ready/web-search-10-typed-command.md`) on purpose: once a `web` entry exists in the command registry, `runGrantedAgentCommand` would find it by `match` and, with a `web` grant, run it in the caller's tab. Landing the refusal first means that path never opens, not even for one release.

Today a `web` line already ends in the same refusal, by accident rather than by rule: `gateAgentCommand` sends it to the caller side, and `runGrantedAgentCommand` finds no `commands` entry for it. This slice makes the refusal explicit so it survives slice 10 registering `web`. The observable output does not change in this slice, so every test below passes against today's behavior too and keeps passing after slice 10.

## Dependencies

- `./product/plans/ready/web-search-1-command-grammar.md` — `isWebCommandLine` in `src/web-search/command.ts` (`/^web(\s|$)/i`, no trimming). That module must exist before this slice lands. It imports only `positiveInteger`, so importing it from `src/acp/tool-table.ts` and `src/agent/command-tools.ts` pulls in no `Managers` or host code.

Later slices rely on this one: `./product/plans/ready/web-search-10-typed-command.md` (registers `web`) and `./product/plans/ready/web-search-12-acp-tool.md` (adds the `web` ACP tool) both list it as a dependency.

## Design decisions

Carried verbatim from the source plan where they apply.

- **Other agent surfaces (user decision).** Only `ask` and `tell` role sessions get `web search` in this version. An `agent` run refuses a `janissary web search …` line with `Agent: command not permitted: <command>.` even when a skill grants `web`, the way it refuses `file glob` and the file mutations today (`gateAgentCommand` in `src/acp/tool-table.ts`, `runGrantedAgentCommand` in `src/agent/command-tools.ts`). Monitor personas keep their existing `web_search` opt-in, which approves the harness's own search and is unchanged; conversations and editor persona queries are untouched.
- **Both checks.** `gateAgentCommand` refuses an `isWebCommandLine` line beside its existing `isFileMutationCommandLine(input) || isFileGlobCommandLine(input)` check. `runGrantedAgentCommand` refuses an `isWebCommandLine` line with the same text, in the same first check, before the grant lookup, as defense in depth.
- **Every `web` line.** The refusal uses `isWebCommandLine`, so `web`, `web search …`, and any malformed `web <word>` line are all refused, never answered with usage, in an agent run.
- **Refusal text.** The `<command>` is the command as the agent emitted it, exactly as the existing file refusals print it.
- **Where the predicate is applied (decision, from precedent).** Both checks test `input`, the local already computed as `command.trim().replace(/^\//, '')`, and interpolate the original `command` into the refusal. So `/web search x` and `  WEB search x` are refused, and the refusal quotes the leading `/` as the agent sent it, as `/file glob x` is quoted today. The `janissary ` prefix is already stripped earlier by `extractAgentCommand` (`src/agent/command-extract.ts`), so neither check sees it.
- **One condition, not a new branch (decision).** `isWebCommandLine(input)` is a third disjunct in the existing first `if` in each function, not a separate `if`, so the order of checks and the refusal text stay single-sourced. Break the condition across lines if it gets long; there is no `max-len` rule, and neither file is near the 200-line limit (`src/acp/tool-table.ts` is 142 lines, `src/agent/command-tools.ts` 38).
- **Word boundary (from `isWebCommandLine`).** `webby x` and `websearch x` are not `web` lines. The gate still sends them to the caller side, and the runner still leaves them to the grant check, exactly as today.
- **Remote runs (from precedent).** A remote `agent` run's far side drives the same `driveToolLoop` → `gateCommand` (`src/remote/serve-acp-loop.ts`), so the far side's gate refuses with the same text. A far side that does not yet have this change (this slice does not bump `REMOTE_PROTOCOL_VERSION`) sends the line back as a caller command, and the local `runGrantedAgentCommand` refuses it before dispatch, so it never runs in the caller's tab. This is the same two-sided arrangement `product/specs/agent-command.md` describes for `file glob` ("The local side refuses a glob line on its own as well…").
- **Grants (from precedent).** A skill's `janissary.json` may name only known canonical commands (`readGrants` in `src/agent/skill-grants.ts` throws `Agent: unknown command grant …`), so a real `web` grant becomes possible only once slice 10 registers `web`. The tests below build `AgentSnapshot` / `AcpRunSnapshot` values with `grants: ['web']` directly, which does not depend on that.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this slice uses it |
| --- | --- | --- |
| Agent-run gate | `src/acp/tool-table.ts` (`gateAgentCommand`, the line `if (isFileMutationCommandLine(input) \|\| isFileGlobCommandLine(input)) return { refusal: …}`) | One more predicate in the first refusal check. |
| Agent command runner | `src/agent/command-tools.ts` (`runGrantedAgentCommand`, the same first `if`, before `commands.find`) | One more predicate in the first refusal check. |
| Web line predicate | `src/web-search/command.ts` (`isWebCommandLine`, from slice 1) | The test both checks use, imported as `../web-search/command.js` in both files. |
| Agent snapshot fixture | `src/acp/tool-table.test.ts` (the `agent(...)` helper and the `refuses agent file globs when %s` `it.each`) | Model for the new gate tests. |
| Runner test shape | `src/agent/command-tools.test.ts` (`refuses file glob lines with or without the file grant, before dispatch`) | Model for the new runner test: a `vi.fn` `dispatchLineInInvocation` that must not be called. |

## Proposed changes

Land in this order within the one change: the two source edits, then their tests, then the spec. Each source edit is independent, so typecheck stays green after either.

- **`src/acp/tool-table.ts`** — import `isWebCommandLine` from `../web-search/command.js`; `gateAgentCommand`'s first check also refuses `isWebCommandLine(input)`, returning the same refusal decision the glob line gets: the text `Agent: command not permitted: <command>.` and no `refused` key.
- **`src/agent/command-tools.ts`** — import `isWebCommandLine` from `../web-search/command.js`; `runGrantedAgentCommand`'s first check also refuses `isWebCommandLine(input)`, before `commands.find` and before any dispatch.
- **`product/specs/agent-command.md`** — in both the local-run paragraph (the one starting "A local run granted `file` can request `janissary file read <path>`") and the remote-run paragraph (the one containing "Likewise, `janissary file glob …` returns"), add a sentence beside the glob sentence: `janissary web …` lines, including `janissary web search …`, return `Agent: command not permitted: <command>.` in this version, with or without a `web` grant. In the remote paragraph, say the local side refuses a `web` line on its own as well, as it does for a glob line.

## Tests

- **`src/acp/tool-table.test.ts`** — beside the `refuses agent file globs when %s` `it.each`, add one with the same shape over grants `['web']`, `['file']`, and `[]`: each of `web search node.js`, bare `web`, `web foo`, `WEB SEARCH x`, and `/web search x` gives exactly `{ refusal: 'Agent: command not permitted: <command>.' }` (`toStrictEqual`, so no `refused` key), with `<command>` the input as passed, leading `/` included. Add `webby x` and `websearch x` to the existing `runs the agent command %s on the caller side` `it.each`, so the word boundary is pinned.
- **`src/agent/command-tools.test.ts`** — beside `refuses file glob lines with or without the file grant, before dispatch`, add a test that `runGrantedAgentCommand` returns `Agent: command not permitted: <command>.` for `web search x`, bare `web`, and `/web search x` with grants `['web']` and `[]`, and that the `dispatchLineInInvocation` mock is never called.

## Verification

- `$janissary/scripts/run.mjs check-diff`
- No manual end-to-end check in this slice: behavior is unchanged until slice 10 registers `web`, and before that a skill cannot declare a `web` grant. The grant-bearing case is covered by the unit tests above, which use `grants: ['web']` snapshots directly.

## Out of scope

- `web search` in `agent` runs, monitor personas, conversations, and editor persona queries (user decision).
- Monitor personas' `web_search` opt-in (`SUPPORTED_PERSONA_TOOLS` in `src/persona-parsing.ts`), which stays unchanged.
- Registering the `web` command (`./product/plans/ready/web-search-10-typed-command.md`) and the `web` ACP tool and its core-session gate (`./product/plans/ready/web-search-12-acp-tool.md`).
- A remote protocol version bump; the refusal needs none.
