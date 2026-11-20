# Extract every command block in an ACP reply

**Complexity: 4/10** — ~45 added production lines across 2 files, 6 requirements and 13 extraction scenarios (p=5.24).

Source plan: `./product/plans/complete/allow-acp-sessions-to-accept-multiple-tool-calls-in-a-single-message-for-example.md`. No earlier subplans. This is the first subplan: it changes only the pure extraction contract and its seam, with no behavior change to the loop yet.

## Goal

Make the pure extractor read **every** closed `janissary` fenced block in an agent reply, not just the last one, and return one command plus its display span per block, in order of appearance. This is the foundation for a reply that carries a batch of commands. A single block stays valid and means one command. This subplan does not run commands in parallel or change any loop behavior; it widens the result shape and the injected `extractCommand` seam so later subplans can consume a batch.

The canonical feature scope is the source plan above. This subplan carries the extraction half of its first proposed change, including the malformed-block rule and the no-block final-answer rule.

## Decisions and dependencies

- Depends on nothing; implement and verify it against the current tree before subplan 2.
- The result of extraction is a whole-reply decision, not a per-block stream. Name the valid variant `batch` in `CommandBlockResult`: `{ kind: 'batch'; commands: readonly { command: string; span: CommandBlockSpan }[] }`, non-empty for a valid reply, with entries in appearance order. This replaces the old `one` variant; subplan 3 branches on `batch`. A reply with no `janissary` block still returns `absent`; a reply with any bad block returns the existing `mistake` variant, with its `commands` count taken from the offending block (zero for an unclosed labelled fence), and the caller runs none of the batch's commands.
- A "bad block" is one holding zero command starts, two or more command starts, or an unclosed labelled fence. Keep `isCommandStart` (`src/acp/command-block.ts`, quoted identifier `isCommandStart`) as the command-start test so a command whose arguments span several lines stays one command. An unclosed labelled fence is bad even when an earlier block closed: a truncated batch is corrected as a whole rather than partly run.
- Blocks are identified in appearance order. Execution order is explicitly not decided here; subplan 3 launches them in parallel.
- Keep the extraction pure: no I/O, no transcript access. Widen only the type of the injected `extractCommand` dependency in `AcpLoopDeps`; its call sites are updated in subplan 2.
- Do not add a module. Both edits stay in the existing files.

## What already exists (reuse, don't rebuild)

| Need | Existing piece | Location |
| --- | --- | --- |
| Scan fences and find the labelled block | `openingFence`, `closesFence`, `fenceInfo`, `findCandidate` | `src/acp/command-block.ts` |
| Decide one command vs. a mistake inside a block | `commandFromBlock`, `isCommandStart`, `replyLines` | `src/acp/command-block.ts` |
| Three-variant result consumed by the loop | `CommandBlockResult`, `CommandBlockSpan` | `src/acp/command-block.ts` |
| Injected extractor seam | `AcpLoopDeps.extractCommand` | `src/acp/types.ts` |
| Existing extraction coverage | Colocated Vitest suite | `src/acp/command-block.test.ts` |

## Proposed changes

1. `src/acp/command-block.ts`: change `findCandidate` from tracking a single `closed` candidate to collecting every closed `janissary` fence, and keep a whole-reply flag for an unclosed labelled fence. Change `extractCommandBlock` so a valid reply returns one entry with the command text and its `CommandBlockSpan` for each closed labelled block, in appearance order; a reply with no closed labelled block returns `absent` when no labelled fence is open and a `mistake` when one is unclosed. Run the existing `commandFromBlock` checks on every block so zero or two-or-more command starts still make the whole reply a mistake.
2. Widen `CommandBlockResult` in `src/acp/command-block.ts`: replace the `one` variant with the `batch` variant defined above. Keep `mistake` and `absent` unchanged, including `mistake`'s numeric `commands` count. Have `commandFromBlock` keep its zero-or-more-than-one command-start check per block, and have `extractCommandBlock` return a whole-reply `mistake` from the first bad block. Preserve each block's display span exactly as today so subplan 3 can remove all of them from the displayed reply.
3. `src/acp/types.ts`: widen `AcpLoopDeps.extractCommand` (`extractCommand: (text: string) => CommandBlockResult`) to the new result type. No other field of `AcpLoopDeps` changes. The type change makes `toolExtractor`'s access to the old `result.command` field in `src/acp/tool-table.ts` a typecheck error; that access and its ownership semantics are fixed in subplan 2. The agent-snapshot closure in `src/acp/drive-loop.ts` and `toolExtractor`'s function signature themselves still typecheck, but their whole-reply mistake behavior is corrected in subplan 2. Do not edit either file in this subplan.

## Tests

Extend `src/acp/command-block.test.ts` (colocated Vitest, existing conventions):

- several labelled blocks in one reply return every command with its own span, in appearance order;
- a command whose arguments span several lines stays one command;
- an empty labelled block is a whole-reply mistake;
- a labelled block with two command starts is a whole-reply mistake;
- an unclosed labelled block is a mistake, including when an earlier block was closed;
- prose between and after blocks is ignored for extraction and does not suppress any block;
- the existing one-block case now returns a one-entry `batch` with the same command and span as today, and the no-block case still returns `absent`;
- keep the current cases for other info strings, a bare command line outside a block, the `janissary` prefix strip, a leading slash, `allowQuestion`, and tilde fences passing unchanged.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` after the extraction change and again after the tests; confirm typecheck failures are limited to the two `extractCommand` providers that subplan 2 updates.
- Keep `src/acp/command-block.ts` and `src/acp/types.ts` under the 200-line `max-lines` limit (`max-lines` is an error in `eslint.config.mjs`). The per-block aggregation may raise `sonarjs/cognitive-complexity` (warn at 15); keep it in small local helpers in the same file and add a module only if the line limit is genuinely reached.

## Out of scope

- No parallel execution, step accounting, follow-up prompts, or loop control flow. Those are subplan 3.
- No granted-tool ownership check or change to `toolExtractor` or `drive-loop.ts`. Those are subplan 2.
- No change to `CORRECTION_PROMPT`, the primer, or the spec; the correction sentence and wording are subplans 3 and 4.
- No change to how a reply with no `janissary` block is handled: it stays a final answer. The correction for an empty or malformed block is kept, not removed.
- No new config, batch-size option, per-command timeout, module, wire frame, or client UI.
