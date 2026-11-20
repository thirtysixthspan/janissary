# Correct the ACP spec's unclosed-labelled-block claim

**Complexity: 1/10** — a single spec clause rewritten to match a qualifier that already exists in a sibling spec; no production code, no tests, no new units (p=2.35).

## Issue

`product/specs/acp.md` states unconditionally in the tool-table paragraph that "an unclosed labelled block counts as zero commands and produces the correction sentence." That is wrong. `extractCommandBlock` in `src/acp/command-block.ts` returns the last closed labelled block when one exists, so a reply holding a closed labelled block followed by an unclosed one runs the closed block's command and sends no correction. The qualifier describing this already exists in `product/specs/agent-command.md`.

## Goal

Make the ACP spec's claim about unclosed labelled blocks match the implemented last-closed-wins behavior and the wording already used in `product/specs/agent-command.md`, so a contributor reading the ACP spec does not reintroduce the bug where a trailing unclosed block suppresses an earlier closed block.

## Approach

Rewrite only the named clause in the tool-table paragraph. The two facts to carry over from `product/specs/agent-command.md` are: an unclosed labelled block counts as zero commands and asks for a correction only when no closed labelled block exists, and a later labelled block left unclosed does not suppress the last closed block, which still runs. The behavior is already pinned by `extractCommandBlock` (it keeps the last `closed` candidate) and by the "runs the last closed labelled block when a later labelled block is left unclosed" case in `src/acp/command-block.test.ts`, so no code or test change is needed.

## Implementation steps

1. In `product/specs/acp.md`, in the paragraph beginning "The tools are declared once in `src/acp/tool-table.ts`", replace the clause "an unclosed labelled block counts as zero commands and produces the correction sentence" with wording that states the correction applies only when no closed labelled block exists and that a later unclosed labelled block does not suppress the last closed block.
2. Leave every other word of the paragraph byte-for-byte intact, and change no code, tests, specs, or documentation.

## Tests

None, and none needed: the behavior the clause describes is already covered by `src/acp/command-block.test.ts`, including the last-closed-wins case. This change edits only spec prose. Verify with `$janissary/scripts/run.mjs check-diff` that the full server suite stays green.

## Out of scope

- No change to source code or tests.
- No change to any other sentence of the ACP paragraph, to other specs, to help pages, or to public documentation.
- No change to the pull request description.

## Verification

- `git diff product/specs/acp.md` shows only the one clause replaced and the rest of the paragraph unchanged.
- Read the rewritten clause beside `product/specs/agent-command.md` and `src/acp/command-block.ts` to confirm it states both facts.
- `$janissary/scripts/run.mjs check-diff` passes with the full server suite green.
