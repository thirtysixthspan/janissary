# Tell command and reset

**Complexity: 4/10** — adds two shell commands on the role-aware ACP manager and documents their command-specific outcomes.

## Goal

Add `tell <prompt>` as an instruction-giving counterpart to `ask <prompt>`, with its own tell-role session, reset command, primer line, fallback wording, and shell behavior.

## Decisions and dependencies

- Depends on `acp-prompt-isolation-and-role-orchestration.md` and `role-based-acp-tool-filtering.md`.
- `tell <prompt>` follows ask's core-rendered background reply, echo and placement rules, cancellation, fallback, and settlement. It runs under role `tell`; `ask` keeps role `ask` and receives no tell instruction.
- Append this line after the tool primer and before the Markdown instruction for tell only: `The user is instructing you to carry out a task. Do it with the commands available to you, then briefly report what you did.`
- Bare `tell` prints `Usage: tell <prompt>.`. A tell role with no enabled entries refuses with `ACP: the tell role lists no models.`. When multiple entries fail, report `ACP: every model in the tell role failed.` followed by one `- <harness> <model>: <error>` line per attempt. Preserve the exact existing fallback notice: `ACP: <harness> <model> failed — trying <harness> <model>.`.
- `tell reset` closes only the tell conversation and reports `ACP tell session reset — next tell prompt will start fresh.`, or `No active ACP tell session to reset.`. `ask reset` continues to close only ask.
- Register `tellReset` before `tell` in `src/commands/index.ts`, following the existing ask reset ordering.
- Make tell available wherever ask is available, including remote shell tabs; harness tabs receive neither command.

## Existing code to reuse

- `src/commands/ask.ts` and `ask-reset.ts` define command matching, background replies, and reset wording.
- `src/commands/index.ts` registers core commands and keeps reset ahead of its base command.
- `src/acp/run-prompt.ts` builds the model primer and tool loop.
- `src/acp/manager.ts` runs role-specific prompts and `src/acp/session-manager.ts` closes role-specific sessions.
- `product/specs/acp.md` documents ask, remote availability, command output, and reset.

## Proposed changes

- Add `src/commands/tell.ts` and `src/commands/tell-reset.ts` mirroring the ask command path while passing role `tell`.
- Register both commands in `src/commands/index.ts` in reset-before-prompt order.
- Add the tell instruction to the prompt primer assembly in `src/acp/run-prompt.ts` only for role tell.
- Update `product/specs/acp.md` and `product/specs/roles.md` for tell availability, instruction, model fallback wording, and reset behavior.

## Tests

- Add `src/commands/tell.test.ts` and `tell-reset.test.ts` mirroring ask behavior with exact tell wording and role isolation.
- Extend `src/acp/manager.test.ts` and `manager-fallback.test.ts` for tell role grants, fresh prompt lookup, and fallback wording.
- Test command availability on local and remote shell tabs and absence on harness tabs using the existing command and remote-tab tests.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` after each implementation change and after tests.
- Confirm `ask reset` leaves tell open, `tell reset` leaves ask open, and each command's settled reply stays under its own typed line during concurrent use.

## Out of scope

- Changing the role defaults or roles-tab editor.
- Role-prefixed connection identifiers and record-tab close routing.
- Adding a tell surface to harness tabs or introducing arbitrary shell tools.
