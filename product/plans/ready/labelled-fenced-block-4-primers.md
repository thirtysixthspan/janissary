# Labelled fenced block 4 — rewrite the core and agent primers

**Complexity: 3/10** — 2 primer files edited plus 3 test files with primer assertions, 5 requirements and 5 scenarios (p=4.40)

Rewrite the two primers so agents are actually told to put their one command in a final fenced block whose info string is exactly `janissary`. This closes the loop between what the extractor accepts (subplans 1–3) and what the model is instructed to produce. All other protocol rules in each primer stay the same.

Depends on `./product/plans/ready/labelled-fenced-block-3-extractor-wiring.md` so the block rule is live when the instructions start describing it. Source: `./product/plans/complete/labelled-fenced-block.md`.

## Goal

Change `commandProtocolPrimer` in `src/acp/command-protocol.ts:1` and `agentPrimer` in `src/agent/command-tools.ts:11` to describe the labelled block instead of a bare final command line. Keep every other rule in those primers intact.

## Design decisions

- The rewritten instruction tells the agent to put its one command inside a final fenced block whose info string is exactly `janissary`, with prose allowed after the block, arguments allowed to span lines inside it, and no bare-line fallback. It must not tell the agent to end its reply with a bare command line or to avoid a code fence.
- The core primer keeps its surrounding rules: how the host feeds back output starting with "Output of", that a refused or disabled command returns its refusal as output and must not be retried, and the `At most <maxSteps> commands run for one request.` line whose number still comes from `CORE_MAX_STEPS`. Change only the sentence that states where the command goes.
- The agent primer keeps its other rules: using only selected skill instructions, that only granted commands are permitted, that a question needs the ask-user skill and grant, and the task text and skills sections. Replace only the sentence that currently says to end the reply with a final `janissary <command>` line. The top-of-line `janissary ` marker is now redundant inside a block; the primer teaches the bare form inside the block, though the extractor still tolerates the prefix.
- Keep the same function signatures. Do not add a second source of truth for the label text; the fence info string `janissary` is the single label named in both primers.
- Update the primer assertion at `src/acp/manager.test.ts:232`, which currently expects the no-tools primer to end with the Markdown instruction; after the rewrite it must match the new command-protocol primer text.
- Update `src/acp/command-protocol.test.ts`: its line-9 assertion currently checks for the exact old sentence `end your reply with exactly one command on its own final line, as plain text: no code fence, no prompt marker, nothing after it.` and must be replaced with an assertion that the primer names a final fenced block with info string `janissary`. Keep the other three assertions in that file (`How commands work:` prefix, the `Output of` and refusal text, the `At most N commands run for one request.` cap, and the final-answer ending) meaningful. Keep the primer-order assertions in `src/acp/drive-loop.test.ts` unchanged except where they quote old wording.

## What already exists (reuse, don't rebuild)

| Existing code | What it does | How this subplan reuses it |
| --- | --- | --- |
| `src/acp/command-protocol.ts:1` (`commandProtocolPrimer`) | Builds the core command-exchange protocol from `maxSteps` | Rewrite only the command-placement bullet; keep the rest of the joined lines and the `maxSteps` interpolation. |
| `src/agent/command-tools.ts:11` (`agentPrimer`) | Builds the agent run instruction from task, skills, and grants | Rewrite only the command-placement sentence; keep the surrounding instructions and interpolations. |
| `src/acp/drive-loop.ts:16` (`corePrimer`) | Assembles tools, availability lines, protocol, tell instruction, and Markdown instruction | No change needed; it calls `commandProtocolPrimer`, so the new wording flows through. |

## Proposed changes

Describe the new instruction wording in prose for each primer rather than writing the string literals as code. State the observable contract the implementer must satisfy: the core primer no longer contains the old "own final line, no code fence" sentence and instead names the `janissary` fenced block; the agent primer no longer says to end with `janissary <command>` on a final line. Keep the corrections short and consistent with the human-writing guidelines in `ai/guidelines/human-writing-guidelines.md`.

## Implementation steps

1. Rewrite the command-placement instruction in `src/acp/command-protocol.ts`.
2. Rewrite the command-placement instruction in `src/agent/command-tools.ts`.
3. Update the primer assertions in `src/acp/manager.test.ts`, `src/acp/command-protocol.test.ts`, and any assertion in `src/acp/drive-loop.test.ts` that quotes old wording.

## Tests

- `src/acp/manager.test.ts:232`: the no-tools primer expectation is updated for the rewritten command-protocol primer; the surrounding Markdown-instruction assertion stays.
- `src/acp/command-protocol.test.ts`: the final-line assertion is replaced with a labelled-block assertion; the output-return, refusal, step-cap, and final-answer assertions stay.
- `src/acp/drive-loop.test.ts`: the primer-order tests still pass with the rewritten protocol; the `At most 8 commands run for one request.` and `How commands work:` checks stay meaningful.
- `src/agent/execute.test.ts` checks the assembled agent primer text indirectly; confirm it still passes with the rewritten agent instruction.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Typecheck and tests must stay green. Grep for the old sentence ("end your reply with exactly one command on its own final line" and "end your reply with one final line: janissary") to confirm no primer still teaches the bare-line rule.

## Out of scope

- Changing the label, the correction sentence, or the block extractor; those are fixed in earlier subplans.
- Changing the 8-step cap, the allow-list, tool primers, the tell instruction, the Markdown instruction, skills, or grants.
- Updating the product specs; that is subplan 5.
- Changing command permissions, the gate, or adding a bare-line fallback.
