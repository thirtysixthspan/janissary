# Rewrite the agent-facing command protocol and the ACP spec

**Complexity: 3/10** — ~9 added production lines in 1 file, 7 requirements and 6 primer scenarios (p=4.56).

Source plan: `./product/plans/complete/allow-acp-sessions-to-accept-multiple-tool-calls-in-a-single-message-for-example.md`. Depends on subplan 3: `./product/plans/ready/allow-acp-sessions-to-accept-multiple-tool-calls-in-a-single-message-for-example-3-parallel-batch-loop.md` (the batch behavior, the exact correction sentence, and the over-budget refusal text). No later subplans.

## Goal

Bring the words the agent reads in line with the behavior subplan 3 implemented. `commandProtocolPrimer` currently says "exactly one command" and "One command runs per reply"; it must instead describe batches of commands in separate `janissary` blocks running in parallel, with one follow-up per result. Mirror the same text in `product/specs/acp.md`, including the correction sentence and refusal text verbatim, and fix the spec's claim that a command error settles the run as failed.

The canonical feature scope is the source plan above. This subplan carries its fourth proposed change and the design decisions about protocol wording and the exact primer text.

## Decisions and dependencies

- Depends on subplan 3 landing first: its `CORRECTION_PROMPT` and cap-refusal text are the strings this subplan quotes, so the primer and spec can match the code exactly.
- The group of commands in one reply is called a **batch**. Use that term in the primer and the spec.
- `commandProtocolPrimer` emits exactly this text (the last number is its `maxSteps` argument, which is `CORE_MAX_STEPS` = 8 at the call site in `corePrimer`; the spec quotes the eight-command case verbatim):

> How commands work:
> - To run a command, put it inside a fenced block whose info string is exactly `janissary`. Several such blocks in one reply form a batch; each block holds one command, whose arguments may span several lines. You may write prose after the blocks. A command on a bare line outside a block is just your answer, not a command.
> - All commands in a batch run in parallel. Each result comes back as its own message starting with "Output of" and the command. Read it, then send another batch or give the final answer.
> - A command that is not allowed, is disabled, or is skipped because the step limit was reached returns its refusal as that output; do not retry it.
> - At most 8 commands run for one request, counting every command in a batch. When the task is done, reply with the final answer and no trailing command.

- The correction sentence in the spec must be exactly ``Your reply must contain one or more commands, each inside its own ```janissary fenced block. Try again.``, matching `CORRECTION_PROMPT` in `src/acp/loop.ts`.
- The over-budget refusal text in the spec must be exactly `ACP: step limit reached; command not run.`, matching subplan 3.
- Keep the primer builder signature and call site unchanged: `commandProtocolPrimer(maxSteps)` is still assembled into `corePrimer` only when at least one command remains. No change to the no-tools line, the allow-list line, or the harness-tools lines.

## What already exists (reuse, don't rebuild)

| Need | Existing piece | Location |
| --- | --- | --- |
| Agent-facing protocol text | `commandProtocolPrimer` | `src/acp/command-protocol.ts` |
| Primer assembled into the core prompt | `corePrimer` | `src/acp/drive-loop.ts` |
| Correction sentence | `CORRECTION_PROMPT` | `src/acp/loop.ts` (subplan 3) |
| Authoritative behavior spec | Autonomous tool loop section, quoted primer, `runAcpToolLoop` paragraph | `product/specs/acp.md` |
| Existing primer coverage | Colocated Vitest suite | `src/acp/command-protocol.test.ts` |

## Proposed changes

1. `src/acp/command-protocol.ts`: rewrite the four bullets of `commandProtocolPrimer` to the exact text above. Keep `How commands work:` as the first line, keep the final bullet using the supplied `maxSteps` value, and keep the function's join-and-return shape. Do not add implementation code to this plan; the text above is the agent-facing output to emit.
2. `product/specs/acp.md`: rewrite the command-exchange prose in the autonomous tool loop section that states the one-command rule and the loop's behavior, including the quoted primer block and the `runAcpToolLoop` paragraph. The spec must describe several labelled blocks as one batch, parallel execution, one follow-up per finished command, one tool entry per command, each command counting as one step against the eight-command cap, over-budget refusals with the exact refusal text, whole-reply correction for an empty, multiple-command, or unowned block, and a reply with no block remaining a final answer.
3. In the same spec section, find the current sentence beginning `If a command throws or its result rejects, the loop shows \`ACP error: <message>\` and still reaches its end of run` (quoted fragment) and rewrite its ending, which now goes on to say `The failure starts no further provider turn.` The new behavior: the error becomes an ordinary result delivered in its own follow-up with that same `ACP error: <message>` line, the remaining commands in the batch keep running, and the run ends only on a reply with no commands or when the cap is hit. The `failed` reason stays in the handler's union for other producers, but this loop no longer emits it for a command error.
4. Verify the quoted primer, correction sentence, and refusal text in the spec are character-for-character identical to the strings emitted by `commandProtocolPrimer`, `CORRECTION_PROMPT`, and subplan 3's cap branch.

## Tests

- `src/acp/command-protocol.test.ts`: replace the assertion for `put exactly one command inside a final fenced block` with the batch form (several `janissary` blocks in one reply), add assertions for parallel execution and per-result follow-ups, and keep the assertions that still hold verbatim: the leading `How commands work:`, `starting with "Output of" and the command`, `returns its refusal as that output; do not retry it.`, `At most 8 commands run for one request.` (and its `maxSteps` variant), and the final-answer ending.
- `src/acp/loop.test.ts`: keep the assertion that the correction sentence is the exact new one from Design decisions (subplan 3's coverage), so the spec and the loop cannot drift apart.
- No source-code behavior changes in this subplan, so existing loop, extraction, ownership, and remote suites must keep passing unchanged.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` after the text change and again after the tests; both must be clean.
- Read the spec's quoted primer next to `commandProtocolPrimer` and confirm the four bullets, the correction sentence, and the refusal text match exactly.
- Confirm `src/acp/command-protocol.ts` stays under the 200-line `max-lines` limit.

## Out of scope

- No loop behavior change. Parallel execution, cap refusals, the correction path, and `CORRECTION_PROMPT` itself are subplan 3; this subplan only mirrors them in text.
- No remote forwarding change. That is subplan 5.
- No change to the no-tools line, allow-list line, harness-tools lines, tell instruction, or Markdown instruction.
- No change to the cap value, no configurable batch size or timeout, and no new wire frame or client UI.
- No user-facing documentation outside `product/specs/acp.md`.
