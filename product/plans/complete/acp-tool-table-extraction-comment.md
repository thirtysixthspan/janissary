# Correct the ACP tool-table extraction comment

**Complexity: 1/10** — one production file, one stale comment sentence rewritten in place, no behavior, tests, or new units (p=2.66).

The resolution-strategy comment above `createAcpToolTable` in `src/acp/tool-table.ts` still says the extractor "reads the command inside the last closed labelled block in the reply, whichever tool owns it." That described the old single-command extractor. The code now works differently: `extractCommandBlock` in `src/acp/command-block.ts` scans every closed ```janissary``` fence in the reply, in appearance order, and returns them as one `batch`; `toolExtractor` in `src/acp/tool-table.ts` checks every command in that batch for granted-tool ownership and returns a `mistake` when any command is unowned; and `gateCommand` applies ownership per command when the batch runs. A reader who trusts the comment can reintroduce last-block-only logic.

## Goal

The comment above `createAcpToolTable` describes the extraction behavior the code actually implements, while the first-match gating explanation above it stays intact. No behavior changes.

## Approach

1. Keep the first four lines of the resolution-strategy comment exactly as written: the first-match-over-an-ordered-array rule, the gate stopping at the first `match`, the order tie-break, and the database entry as fall-through.
2. Replace only the trailing extraction sentence. It should state that every closed `janissary` block in a reply is collected in appearance order as one batch, each command is checked for granted-tool ownership, and any unowned block corrects the whole reply.
3. Edit only comment text. Change no code, no tests, no specs, and no documentation. Keep `src/acp/tool-table.ts` at its current line count and under the 200-line `max-lines` limit.

## Implementation steps

1. In `src/acp/tool-table.ts`, rewrite the extraction sentence of the `createAcpToolTable` resolution-strategy comment (currently the lines ending "the extractor reads the command inside the last closed labelled block in the reply, whichever tool owns it.") to the three-point description in Approach, leaving the first-match gating explanation byte-for-byte.
2. Run `$janissary/scripts/run.mjs check-diff` and confirm it is green.

## Tests

None. No test covers a comment, and the change is comment-only, so there is no behavior to pin. Verification is by reading the rewritten sentence against `toolExtractor` and `extractCommandBlock` in `src/acp/tool-table.ts` and `src/acp/command-block.ts`: every closed labelled block is collected in appearance order as one `batch`, every command is checked for granted-tool ownership, and a single unowned command returns a `mistake` that corrects the whole reply.

## Spec updates

None. The functional spec already describes batch extraction of multiple command blocks; this change corrects an internal code comment and does not alter behavior, so no spec is stale.

## Out of scope

- The pull-request title finding, which stays in `product/backlog/pull-request.md` untouched.
- The configurable step cap (`maxToolSteps()`), any extraction or gating logic, and any behavior change.
- Help pages and user documentation; no documented behavior changes.
