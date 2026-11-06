# Tell command and reset

**Complexity: 4/10** — adds a role-specific command pair and primer instruction, while reusing the completed role-aware ACP sessions, dispatch availability, and background reply path.

## Goal

Add `tell <prompt>` as an instruction-giving counterpart to `ask <prompt>`, with its own tell-role session, reset command, primer line, and shell behavior.

## Decisions and dependencies

- Depends on the completed role command and ACP foundation: `product/plans/complete/role-native-command-catalog-and-grants.md:1` (`# Role native command catalog and grants`), `product/plans/complete/role-based-acp-tool-filtering.md:1` (`# Role based ACP tool filtering`), `product/plans/complete/role-keyed-acp-session-state.md:1` (`# Role keyed ACP session state`), `product/plans/complete/acp-prompt-isolation-and-role-orchestration.md:1` (`# ACP prompt isolation and role orchestration`), and `product/plans/complete/preserve-tab-busy-state-across-concurrent-work.md:1` (`# Fix: preserve tab busy state across concurrent ACP and shell work`). This plan adds the command surface; it does not rebuild those role, session, concurrency, or busy-owner mechanisms.
- `tell <prompt>` follows the established ask command's exact typed-line background reply and settlement path. Pass role `tell` to the role-aware prompt API; keep `ask` on its default `ask` role and do not give ask the tell instruction. The manager already implements tell usage, model fallback, and tell-specific failure wording.
- Add this line to the prompt primer for role `tell` only, after the tool primer and before the Markdown instruction: `The user is instructing you to carry out a task. Do it with the commands available to you, then briefly report what you did.`
- Preserve the existing tell messages: bare `tell` prints `Usage: tell <prompt>.`; a tell role with no enabled models reports `ACP: the tell role lists no models.`; exhausted tell model fallback reports `ACP: every model in the tell role failed.` followed by one `- <harness> <model>: <error>` line per attempt. The inter-model notice remains `ACP: <harness> <model> failed — trying <harness> <model>.` These manager outcomes are already covered by `src/acp/manager-fallback.test.ts:247` (`uses tell-specific empty-model and usage messages`) and `src/acp/manager-fallback.test.ts:263` (`names tell in prompt and startup exhaustion while keeping tell fallback order`); do not add duplicate manager behavior work here.
- `tell reset` closes only role `tell` and reports `ACP tell session reset — next tell prompt will start fresh.`, or `No active ACP tell session to reset.` Pass `undefined` as the close output argument and `'tell'` as the role argument. `ask reset` retains its current ask-only behavior.
- Use the existing `acpAvailable` policy for both tell commands: resolve them wherever ask is available, which means plugin-view tabs whose declaration includes `promptAcp`, including remote shell tabs. Harness tabs must not dispatch either command to ACP; their unavailable tell inputs fall through to the ordinary unknown-command resolution.
- Register `tellReset` before `tell`. Declare samples for both so the command-priority check continues to catch shadowing.
- Keep help pages and user documentation for `product/plans/draft/role-native-commands-and-tell-documentation-integration.md:11` (`Depends on all preceding subplans`), which owns the later documentation integration pass.

## What already exists (reuse, don't rebuild)

| Concern | Existing code or behavior |
| --- | --- |
| Prompt command matching, one-shot settlement, and exact typed-line reply | `src/commands/ask.ts:7` (`command`), `src/commands/ask.ts:19` (`appendAcpBackgroundReply`), and `src/commands/ask.ts:21` (`promptResult`) |
| Reset matching, role-default close, and one tagged confirmation | `src/commands/ask-reset.ts:6` (`command`) and `src/commands/ask-reset.ts:13` (`managers.acp.close(tab.label)`) |
| Core command ordering | `src/commands/index.ts:43` (`coreCommands`) places `src/commands/index.ts:46` (`askReset`) before `src/commands/index.ts:48` (`ask`); apply the same reset-before-prompt rule to tell |
| Registry, typed-command routing, and registered command names | `src/commands/index.ts:90` (`commands`) feeds `src/commands/index.ts:101` (`findCommand`); `src/command/manager.ts:30` (`run`) and `src/command/manager.ts:92` (`dispatchLine`) resolve typed and dispatched lines through `resolveInTab`; `src/commands.ts:19` (`availableCommands`) derives the names from the registry |
| Per-tab availability | `src/command/resolve-in-tab.ts:5` (`resolveInTab`) filters the registered command through `available`; `src/acp/availability.ts:3` (`acpAvailable`) requires a plugin view and `promptAcp` |
| Shell capability and remote ACP transport | `src/plugins/shell/manifest.ts:8` (`id: 'shell'`) and `src/plugins/shell/manifest.ts:39` (`promptAcp`); `src/acp/session-manager.ts:75` (`tab.remote` selects the remote ACP session) |
| Role-aware prompt and close APIs | `src/acp/manager.ts:74` (`promptResult` accepts role as its third argument); `src/acp/session-manager.ts:105` (`close` accepts role as its third argument) |
| Prompt primer assembly | `src/acp/run-prompt.ts:47` (`primer` joins the tool primer and Markdown instruction) |
| Command sample priority coverage | `src/commands.test.ts:36` (`command registry priority`) checks every sample against `resolveCommand` ordering |
| Tell fallback, role isolation, concurrency, and busy ownership | `src/acp/manager-fallback.test.ts:247` (`tell-specific empty-model and usage messages`), `src/acp/manager.test.ts:505` (distinct ask and tell sessions), `src/acp/manager.test.ts:527` (closing tell leaves ask open), and `src/acp/record-feed.test.ts:97` (concurrent role streams and busy state) |
| ACP and roles specs | `product/specs/acp.md:14` (`A plugin requesting promptAcp` currently says tell is not exposed), `product/specs/acp.md:18` (`ask <prompt>`), `product/specs/acp.md:22` (ask-only command surface), `product/specs/acp.md:79` (`the prompt's ask role` tool-primer wording), `product/specs/acp.md:89` (remote shell availability), and `product/specs/roles.md:192` (`The only reader besides the tab` currently names ask only) |

## Proposed changes

- Add `src/commands/tell.ts` by following `src/commands/ask.ts:7` (`command`): match `tell` case-insensitively with ask's word-boundary behavior, mark it core-rendered, and pass `managers.acp.promptResult(tab.label, command, 'tell')` into the same one-settlement background reply path. Preserve `invocation.line ?? command` from `src/commands/ask.ts:14` (`line`) for the displayed line, including malformed or slash-prefixed input.
- Add `src/commands/tell-reset.ts` by following `src/commands/ask-reset.ts:6` (`command`): match `tell reset` case-insensitively with ask-reset's whitespace and word-boundary behavior, call `managers.acp.close(tab.label, undefined, 'tell')`, and append exactly one background confirmation with a fresh id and the exact input line.
- Register `tellReset` before `tell` in `src/commands/index.ts:43` (`coreCommands`) and declare samples such as `tell`, `tell hello`, `tell reset`, and `tell reset extra` so `src/commands.test.ts:41` (`routes every declared sample`) exercises the overlap.
- Update `src/acp/run-prompt.ts:47` (`primer`) to include the tell instruction only when `request.role === 'tell'`, preserving the current tool-primer and Markdown ordering when tools are empty or present.
- Update `product/specs/acp.md:14` (`A plugin requesting promptAcp`), `product/specs/acp.md:18` (`ask <prompt>`), `product/specs/acp.md:22` (the ask command surface), `product/specs/acp.md:79` (`the prompt's ask role` tool-primer wording), and `product/specs/acp.md:89` (remote shell) to describe tell availability, role-specific wording and reset, and the instruction line. Update `product/specs/roles.md:192` (`The only reader besides the tab`) to include the tell command as a consumer of the tell role's entries and grants.

## Tests

- Add `src/commands/tell.test.ts` alongside `src/commands/ask.test.ts:30` (`describe('ask command')`). Cover case-insensitive word-boundary matching including bare `tell` and rejection of `telling`; role `tell` is passed as the third `promptResult` argument; exact typed-line preservation; one settled background reply for answer, refusal, and rejected promise; and no duplicate settlement.
- Add `src/commands/tell-reset.test.ts` alongside `src/commands/ask-reset.test.ts:8` (`describe('ask-reset command')`). Cover case-insensitive matching with extra whitespace; assert `close` receives `(label, undefined, 'tell')`, both exact tell reset messages, exact input placement, one confirmation, and a fresh background id per call.
- Add focused coverage in `src/command/resolve-in-tab.test.ts` for local and remote shell plugin tabs declaring `promptAcp`, plus a harness tab. Both `tell` and `tell reset` must resolve to their commands for the shell cases and must fall through to the ordinary unknown-command result for the harness case.
- Keep the sample-order assertion in `src/commands.test.ts:41` (`routes every declared sample`) as the registry-level guard; no edits to manager fallback, role concurrency, or busy-owner tests are needed because those behaviors already have the coverage cited above.
- Do not add a new primer assembly module; add `src/acp/run-prompt.test.ts` because there is no existing `runCorePrompt` test. Assert the exact line appears only for tell, after tool text and before Markdown, including the no-tool case.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` after implementation changes.
- Manually in a local shell tab, run ask and tell prompts concurrently and confirm each settled reply remains beneath its own typed line; reset tell and confirm ask remains open, then reset ask and confirm tell remains open.
- Manually in a connected remote shell tab, run `tell <prompt>` and `tell reset` to confirm the existing remote ACP path is used. In a harness tab, confirm `tell` and `tell reset` return the ordinary unknown-command result without dispatching to ACP.

## Out of scope

- Changing role defaults, grants, or the roles-tab editor; those are already established by the completed role command catalog and grants plan.
- Role-prefixed connection identifiers and record-tab close routing, which belong to `product/plans/draft/role-aware-acp-connection-identity.md:1` (`# Role aware ACP connection identity`).
- Help pages, user documentation, and the later full integration smoke flow, owned by `product/plans/draft/role-native-commands-and-tell-documentation-integration.md:1` (`# Role native commands and tell documentation integration`).
- Adding a tell surface to harness tabs or introducing arbitrary shell tools.
