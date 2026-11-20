# Labelled fenced block 3 — wire both paths to the shared extractor

**Complexity: 4/10** — 3 existing files touched (2 edits, 1 deletion), 6 requirements and 8 scenarios (p=4.88)

Make the core and agent-driven paths actually take their command from the labelled block. Point `toolExtractor` at the shared extractor, delete the old agent extractor module and its test, and have `driveToolLoop` call the shared extractor directly with `snapshot.askUser` as `allowQuestion` for the agent kind. Gating and which side runs a command stay exactly as they are.

Depends on `./product/plans/ready/labelled-fenced-block-1-command-block-extractor.md` (shared extractor) and `./product/plans/ready/labelled-fenced-block-2-loop-result-contract.md` (loop reads the result type). Source: `./product/plans/complete/labelled-fenced-block.md`.

## Goal

Replace the temporary adapter from subplan 2 with the real shared block extractor on both snapshot kinds, retire `src/agent/command-extract.ts`, and move its test coverage into `src/acp/command-block.test.ts`. After this subplan there is one block rule and one extractor implementation; the old wrapper and its second fenced-content scan are gone.

## Design decisions

- `toolExtractor` at `src/acp/tool-table.ts:195` changes its return type to the result type and delegates to the shared extractor instead of calling `findLastCommandLine`, passing `allowQuestion: true` so a question line is a normal command for the core path. Keep `AcpTool.isCommandLine`, `gateCommand`, and `nativeCommandName` as the definitions of a known command and its permission. Tool-table order and ownership do not change; extraction no longer depends on table order, matching the existing note in `tool-table.ts` that the last recognized line wins.
- `src/acp/drive-loop.ts:74` uses `toolExtractor(tools)` for the core kind (now result-typed) and calls the shared extractor for the agent kind with `snapshot.askUser` as `allowQuestion` so the preserved question behaviour holds. Remove the temporary adapter, the local wrapper, and the import of `extractAgentCommand`. The shared extractor's block span flows straight into the display filter from subplan 2.
- Delete `src/agent/command-extract.ts` now that its fence helpers live in `command-block.ts` (subplan 1) and nothing imports it. Delete `src/agent/command-extract.test.ts`; fold its cases into `src/acp/command-block.test.ts`: the `janissary ` marker is not required inside a labelled block but is still tolerated there, a bare final command line outside a labelled block is not extracted, and tilde-fenced content is not read unless it is the last closed labelled block.
- Leave `cleanCommandLine` and `findLastCommandLine` in `src/acp/command-line.ts` unchanged. `extractDatabaseCommand` (`src/database/primer.ts:30`), `extractQuestionCommand` (`src/question-command.ts:44`), and `extractBrowserCommand` (`src/browser/command.ts:87`) still call `findLastCommandLine` for their own whole-reply extractors and stay out of this change.
- The remote path needs no new protocol message, RPC, or frame. `src/remote/serve-acp-loop.ts:109` calls `driveToolLoop` on the far side, so the extraction change lands wherever `driveToolLoop` runs. Verify no remote frame type changes.
- Keep file sizes under the 200-line `max-lines` rule; do not grow `src/acp/tool-table.ts`. New relative imports use `.js` extensions per `AGENTS.md`.

## What already exists (reuse, don't rebuild)

| Existing code | What it does | How this subplan reuses it |
| --- | --- | --- |
| `src/acp/command-block.ts` (subplan 1) | One shared block extractor and result type | Call it from `toolExtractor` and `driveToolLoop`; no second fence scan. |
| `src/acp/tool-table.ts:195` (`toolExtractor`) | Current line-based extractor factory | Replace its body with a delegation; keep the table, predicates, and gate untouched. |
| `src/acp/drive-loop.ts:63` (`driveToolLoop`) | Chooses extractor and primer per snapshot kind and drives the loop | Swap both extractor branches for the shared extractor; keep primer choice, `maxSteps`, `describeCommand`, and event forwarding as they are. |
| `src/agent/command-extract.ts:16` (`extractAgentCommand`) | Old agent-wrapper extractor with its own fenced-content scan | Retire the file after its fence helpers move; do not keep a wrapper. |

## Proposed changes

Describe each edit in prose: the new `toolExtractor` contract (a factory returning a function of reply text to the result type, using the shared extractor with the tool vocabulary gate), the `driveToolLoop` extractor argument for core and agent kinds, and the two file deletions. Name the folded test cases; do not write implementation code.

## Implementation steps

1. Change `toolExtractor` in `src/acp/tool-table.ts` to return the result type and delegate to the shared extractor with `allowQuestion: true`.
2. Change `src/acp/drive-loop.ts` to use `toolExtractor(tools)` for core and the shared extractor with `snapshot.askUser` for agent, and remove the temporary adapter and the old import.
3. Delete `src/agent/command-extract.ts` and `src/agent/command-extract.test.ts`; fold their cases into `src/acp/command-block.test.ts`.
4. Update the affected assertions in `src/acp/tool-table.test.ts` and `src/acp/drive-loop.test.ts` for the block contract and the result type.

## Tests

`src/acp/tool-table.test.ts`:

- Core extraction now takes the command from the last closed labelled block; a bare command line outside a labelled block is not extracted.
- Gating (`gateCommand`), refusal text, and caller/workspace side selection are unchanged by the extraction switch.
- Table order, primers, the allow-list, and the database fall-through behave as before.

`src/acp/drive-loop.test.ts`:

- Both core and agent-driven paths take the command from a labelled block; the agent path still passes `snapshot.askUser`, so a bare `question ask` line is only extracted when ask-user is enabled.
- The `janissary ` prefix is not required inside a labelled block but is tolerated and stripped.
- Gating, side selection, the 8-step core cap, and the uncapped agent path are unchanged from subplan 2.
- No test imports `src/agent/command-extract.js` any more.

`src/acp/command-block.test.ts`: add the folded agent cases listed under Design decisions. `src/acp/command-line.test.ts` stays unchanged.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Typecheck must stay green after removing the old module and the temporary adapter. Grep for `extractAgentCommand`, `command-extract`, and the old `findLastCommandLine` call in the loop path to confirm no call sites remain. Confirm `src/acp/tool-table.ts` is still under 200 lines and that no remote frame type changed.

## Out of scope

- Rewriting the two primers or updating the specs; subplans 4 and 5.
- Changing `cleanCommandLine`, `findLastCommandLine`, or the three legacy whole-reply extractors.
- Changing the label, the correction sentence, the 8-step cap, the gate, command permissions, or adding a bare-line fallback.
- Adding a second command per turn or any client/server protocol change.
