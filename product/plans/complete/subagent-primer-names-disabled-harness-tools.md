# Name the disabled harness tools in the subagent's tool primer

**Complexity: 3/10** — ~10 added lines in 2 production files, 4 behavioral requirements and 5 test scenarios (p=4.384)

## Goal

A subagent runs as an ACP role session and receives the ordinary core tool primer at the provider boundary (`runSubagentEntry` in `src/subagent/attempt.ts` builds an `ask`-shaped snapshot with `withoutTools: false` and runs it through `runToolLoop` → `driveToolLoop` → `corePrimer` in `src/acp/drive-loop.ts`). That primer already says "You have no built-in tools; use only the commands listed here." when commands are available, but it never says *which* harness tools are unavailable. A model accustomed to a harness's own tools can therefore try to call `bash` or `shell` and spend a turn on a denial. The primer should explicitly name the standard harness tools that are not enabled and tell the agent not to call them.

## Approach

1. Add a new exported constant to `src/acp/internal-tools.ts`, beside the existing tool-availability lines, naming the standard harness tools that role sessions never get and forbidding their use. The wording names `bash` and `shell` explicitly (the command-execution tools a model is most likely to reach for) as examples of the harness's own tools, states they are not enabled, and directs the agent to use only the listed commands. Keep it harness-agnostic: the two config layers in `internalToolDenial` already turn the real tools off, so this line is guidance, not a new policy.

2. `corePrimer` inserts that line immediately after `NO_BUILTIN_TOOLS_LINE`, only in the `toolsAvailable` branch (at least one tool and one available command), before the command-exchange protocol. Sessions with no available command keep `You have no tools; answer in prose.` and get no new line, so every no-tools exact-text expectation is unchanged. Ordering of every existing piece is otherwise untouched. Because subagents use the tools-available core primer, they receive the new line; `ask` sessions that grant commands do as well.

Rejected alternative: adding the sentence only to `subagentTaskPrompt` in `src/subagent/primer.ts`. That prompt carries the task and final-result instructions, not tool availability, and adding tool guidance there would duplicate the core primer and drift from it.

## Implementation steps

1. In `src/acp/internal-tools.ts`, export `DISABLED_HARNESS_TOOLS_LINE` with a short explanatory comment and the sentence naming `bash` and `shell` and forbidding their use.
2. In `src/acp/drive-loop.ts`, import the new constant and add it as a `toolsAvailable`-gated entry in `corePrimer`'s array, between `NO_BUILTIN_TOOLS_LINE` and `commandProtocolPrimer`.
3. Update the colocated tests that pin the exact tool-bearing primer text and add focused coverage of the new line.

## Tests

- `src/acp/internal-tools.test.ts`: the new constant names `bash` and `shell`, says they are not enabled, and says not to call them.
- `src/acp/drive-loop.test.ts`: the full tool-bearing primer places the new line between the no-built-in-tools line and the command protocol; a no-tools primer omits it; a focused case asserts the line is present for an `ask` role with granted commands.
- `src/acp/run-prompt.test.ts`: exact-equality expectations for tool-bearing primers include the new line in the same position; the no-tools exact expectations are unchanged.
- `src/acp/subagent/attempt.test.ts` computes its primer from `corePrimer` directly and needs no change; confirm its dynamic expectation still holds. No new production test helper is needed.

## Spec and docs

- `product/specs/acp.md`: extend the primer-ordering paragraph in the ACP section to state that when commands are available the primer names the standard harness tools that are disabled, citing `bash` and `shell`, and tells the agent not to call them; note the line is omitted when there are no available commands.
- `product/specs/subagent.md`: note in the attempt/primer paragraph that the ordinary command primer the subagent receives names the disabled harness tools and forbids calling them.
- `help/` and `documentation/user-documentation/` do not describe primer text; no change expected.

## Out of scope

- Changing the two config-layer tool denials in `internalToolDenial` or the harness adapters; the new line is guidance only.
- Rewording the existing `NO_BUILTIN_TOOLS_LINE` / `NO_TOOLS_LINE` text or the command-exchange protocol.
- Changing agent-run (`agent` command) primers, which use native harness tools and a different prompt path.
- Adding the line to the no-tools primer, where it would be redundant with "You have no tools; answer in prose."
