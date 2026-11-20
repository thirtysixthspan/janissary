# Apply granted-tool ownership to every extracted command block

**Complexity: 3/10** — ~20 added production lines across 2 files, 4 requirements and 7 ownership scenarios (p=4.61).

Source plan: `./product/plans/complete/allow-acp-sessions-to-accept-multiple-tool-calls-in-a-single-message-for-example.md`. Depends on subplan 1: `./product/plans/ready/allow-acp-sessions-to-accept-multiple-tool-calls-in-a-single-message-for-example-1-batch-extraction.md` (the widened batch extraction result). No later subplans.

## Goal

Make the granted-tool filter work on a whole batch: it keeps every block whose command a granted tool owns, but turns the entire reply into a correctable mistake when **any** block is unowned. Today `toolExtractor` maps an unowned command to `absent`, which would silently end the run in the middle of a batch. Update both extraction call sites in `driveToolLoop` so local ask/tell, plugin-owned sessions, agent runs, and remote-hosted loops all use the batch-aware path. This subplan still does not run commands in parallel; that is subplan 3.

The canonical feature scope is the source plan above. This subplan carries its second proposed change, including the "any bad block corrects the whole reply" decision from the design decisions.

## Decisions and dependencies

- Depends on subplan 1 landing first: `toolExtractor` and the agent-snapshot closure must return the new batch result shape.
- Ownership is decided from the first line of each block's command, using each `AcpTool`'s `isCommandLine` exactly as `toolExtractor` does today. A block whose command no granted tool owns is a whole-reply `mistake`, never `absent`, so the loop corrects the reply and runs none of its commands.
- The batch is all-or-nothing: one unowned block corrects the entire reply, even when its other blocks are owned. This matches the design decision that any bad block corrects the whole reply. The returned `mistake` keeps the offending block's numeric `commands` count from subplan 1; the caller only needs the `mistake` kind.
- Both extraction providers in `driveToolLoop` keep their current expressions: `toolExtractor(tools)` for a core snapshot and `(text) => extractCommandBlock(text, snapshot.askUser)` for an agent snapshot. Keep `snapshot.askUser` flowing into the agent path. What changes is the result they now carry, not the wiring; edit those lines only if the widened type from subplan 1 demands it.
- `CORE_MAX_STEPS` stays eight. Do not change the step cap value here.
- Keep the work in the two existing files; no new module.

## What already exists (reuse, don't rebuild)

| Need | Existing piece | Location |
| --- | --- | --- |
| Batch extraction result from subplan 1 | `extractCommandBlock`, `CommandBlockResult` | `src/acp/command-block.ts` |
| Per-tool command ownership test | `toolExtractor`, `AcpTool.isCommandLine` | `src/acp/tool-table.ts` |
| The two extraction call sites | `toolExtractor(tools)` and the `extractCommandBlock` agent closure | `src/acp/drive-loop.ts` |
| Eight-command cap constant | `CORE_MAX_STEPS` | `src/acp/drive-loop.ts` |
| Existing ownership coverage | Colocated Vitest suite | `src/acp/tool-table.test.ts` |

## Proposed changes

1. `src/acp/tool-table.ts`: rewrite `toolExtractor` so it calls the batch-aware `extractCommandBlock` from subplan 1 and then checks ownership for **each** returned block. A valid extraction whose every block's first command line is owned by some `AcpTool.isCommandLine` (the field already defined in `AcpTool`, quoted identifier `isCommandLine`) is returned unchanged as the `batch` variant; if any block is unowned, return the whole-reply `mistake` variant. A `mistake` or `absent` from extraction passes through unchanged. Keep testing only the first line of a command, as `toolExtractor` does today, so a multi-line command stays one block.
2. `src/acp/drive-loop.ts`: keep `extractCommand: snapshot.kind === 'core' ? toolExtractor(tools) : (text) => extractCommandBlock(text, snapshot.askUser)` as the two providers, but confirm both now yield the batch result from subplan 1 and that the agent path keeps its `askUser` argument. No other field of the `runAcpToolLoop` dependency object changes in this subplan.
3. Leave `CORE_MAX_STEPS` at eight and leave the `maxSteps` wiring as `snapshot.kind === 'core' ? CORE_MAX_STEPS : Infinity`.

## Tests

Extend `src/acp/tool-table.test.ts` (colocated Vitest, existing conventions):

- `toolExtractor` keeps a batch of labelled blocks when a granted tool owns each command;
- one unowned block among otherwise owned blocks makes the whole reply a `mistake`, not `absent` and not a partial batch;
- a single unowned block behaves the same way, preserving the existing unowned-command expectation at the whole-reply level;
- keep existing cases for owned browser/question/database/file/web commands and for a bare unlabelled line passing unchanged.

Existing suites that exercise the two providers must keep passing with the new result shape: `src/acp/run-prompt.test.ts` (its `deps.extractCommand` assertions), `src/acp/drive-loop.test.ts`, and `src/native-commands/feature.integration.test.ts` (it calls `toolExtractor` directly).

## Verification

- Run `$janissary/scripts/run.mjs check-diff` after the source change and again after the tests; the two `extractCommand` type errors from subplan 1 must be gone.
- Confirm `src/acp/tool-table.ts` and `src/acp/drive-loop.ts` stay under the 200-line `max-lines` limit. `src/acp/tool-table.ts` already has roughly 173 effective lines (blank and comment lines skipped), so the ownership loop has little headroom: keep the added logic tight and extract a local helper in the same file if the limit is reached rather than compacting code.

## Out of scope

- No parallel launch, follow-up queue, step accounting, or `loop.ts` changes. Those are subplan 3.
- No protocol or primer rewrites and no spec edits. Those are subplan 4.
- No remote caller-command forwarding fix. That is subplan 5; remote loops inherit this path through `driveToolLoop`.
- No change to the cap value, the cold-start retry, or the no-block final-answer behavior.
- No new wire frame, UI, timeout, or batch-size option.
