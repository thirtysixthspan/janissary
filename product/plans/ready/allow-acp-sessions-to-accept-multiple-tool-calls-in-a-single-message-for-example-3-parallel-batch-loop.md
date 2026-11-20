# Run a command batch in parallel with one follow-up per result

**Complexity: 5/10** — ~50 added production lines in 1 file, 10 behavioral requirements and 12 loop scenarios (p=5.38).

Source plan: `./product/plans/complete/allow-acp-sessions-to-accept-multiple-tool-calls-in-a-single-message-for-example.md`. Depends on subplan 1: `./product/plans/ready/allow-acp-sessions-to-accept-multiple-tool-calls-in-a-single-message-for-example-1-batch-extraction.md` and subplan 2: `./product/plans/ready/allow-acp-sessions-to-accept-multiple-tool-calls-in-a-single-message-for-example-2-tool-ownership.md` (the batch result and the whole-reply ownership rule). No later subplans.

## Goal

Change `runAcpToolLoop` so a reply with several `janissary` blocks launches all of its commands in parallel, spends one step per command, and sends one follow-up message per finished command in completion order. Each result keeps the existing `Output of <command>:` block and closing instruction lines, and each command is recorded through `h.ranCommand` as it completes. A command that throws or rejects becomes an ordinary result; the run ends only on a reply with no commands or when the cap is hit. This is the behavioral core of the feature; every consumer inherits it through `driveToolLoop`.

The canonical feature scope is the source plan above. This subplan carries its third proposed change and all of the loop-related behavioral requirements and edge cases.

## Decisions and dependencies

- Depends on subplans 1 and 2 landing first: `extractCommand` now returns the valid batch list or a whole-reply `mistake`, and an unowned block already turns the whole reply into a mistake. This subplan consumes that shape and does not re-implement ownership.
- Parallel launch: every command in a batch is started before any result is fed back, so commands in one reply run at the same time and must not depend on one another's results. The primer telling the agent this is subplan 4.
- One follow-up per result, serialized: `startTurn` / `chunk` / `endTurn` model a single current transcript turn, so follow-up prompts are sent through one pump that has only one prompt in flight at a time. Each completed or refused command enqueues one result carrying its command, output, and display label (`dependencies.describeCommand?.(command) ?? command`, as today). The pump sends the next result's follow-up only after the previous turn finishes, opening a fresh turn for each, and consumes the queue in completion order. The follow-up keeps the existing `Output of` block (`Output of \`<label>\`:\n<output>\n\n`) and these closing lines verbatim: `If the task is complete, reply with the final answer and no command. Otherwise issue the next command. Be concise: do not explain what you are doing. Only output commands and the final answer.` A result that finishes while the pump is busy is queued, never dropped. This lets the agent act on a partial result before the rest of the batch drains.
- Step accounting: every command in a batch counts as one step against `maxSteps` (eight in core), even when commands run in parallel. A batch of five consumes five steps. Keep the step count in loop-local state advanced once per command (run or refused), not per turn as the old recursion did; the `step` threaded through `turn` and `promptOnce` no longer tracks one command per turn. `maxSteps` and the cold-start retry are unchanged.
- Cap boundary: when a batch is larger than the remaining budget, run only the commands that fit. For each over-budget command, send a follow-up whose result text is exactly `ACP: step limit reached; command not run.` and never call `runCommand` for it. The cap is never exceeded. Deliver the batch's queued follow-ups (including the refusals) before emitting `finished('capped', maxSteps)`; if an agent reply arrives with the budget already exhausted, run nothing and finish capped.
- Failures: a command that throws synchronously or whose promise rejects yields its result text using the existing `ACP error: <message>` line, is delivered in its own follow-up like any other output, and does not end the run. The remaining commands keep running. `h.finished` keeps its `failed` variant for other producers, but this loop no longer emits it for a command error.
- Malformed block: a whole-reply `mistake` from extraction sends the correction prompt and runs none of the batch's commands, on the existing correction path that does not spend a step. A reply with no `janissary` block stays a final answer.
- Set `CORRECTION_PROMPT` in `src/acp/loop.ts` to exactly: ``Your reply must contain one or more commands, each inside its own ```janissary fenced block. Try again.`` Subplan 4 mirrors this sentence in the primer and spec.
- Keep the control flow pure: all side effects stay injected through `AcpLoopDeps` and `AcpLoopHandlers`; no reach into live session state.

## What already exists (reuse, don't rebuild)

| Need | Existing piece | Location |
| --- | --- | --- |
| Loop control flow, turns, cold-start retry | `runAcpToolLoop`, `turn`, `promptOnce` | `src/acp/loop.ts` |
| Correction sentence | `CORRECTION_PROMPT` | `src/acp/loop.ts` |
| Follow-up text and result recording | `runCommand` await, follow-up string, `h.ranCommand` | `src/acp/loop.ts` |
| Remove matched block from display | `filterCommandFromDisplay`, `lineAt`, `isFence` | `src/acp/loop.ts` |
| Terminal outcomes | `h.finished` reasons `answered` / `capped` / `failed` | `src/acp/types.ts`, `src/acp/loop.ts` |
| Error text helper | `errorText` | `src/error-text.ts` |
| Batch extraction result | `CommandBlockResult` | `src/acp/command-block.ts` (subplan 1) |
| Existing loop coverage | Colocated Vitest suite | `src/acp/loop.test.ts` |

## Proposed changes

1. `src/acp/loop.ts`: change the `onEnd` handling of a valid extraction from the old single-command branch to the `batch` variant from subplan 1. Launch every command in the extracted list in parallel by calling `dependencies.runCommand` for each and normalizing a synchronous value or a promise to a string. Keep the cold-start retry logic for the first turn unchanged.
2. Add a serialized result pump rather than one nested follow-up per command. Each completed or refused command contributes one queued result carrying its command, output, and display label. The pump opens one turn at a time via `h.startTurn` / `h.chunk` / `h.endTurn`, using the `Output of` block and the verbatim closing lines listed above, and consumes the queue in completion order. A new batch extracted from a follow-up reply is launched after that turn ends, and its results append to the same queue behind any results already waiting.
3. Track steps by counting every command in a launched batch. Take only `maxSteps - step` commands for execution; deliver the exact over-budget refusal text for the rest as their queued results without running them, and finish as `capped` when the budget is exhausted. Do not change the eight-command cap or the correction's no-step behavior.
4. Replace the command-error settle path: a thrown or rejected `runCommand` produces the existing `ACP error: <message>` output for its own follow-up and is recorded through `h.ranCommand`, then the loop continues. Keep `h.finished('failed', ...)` only for other producers; this loop no longer emits it for a command error.
5. `src/acp/loop.ts`: change `filterCommandFromDisplay` to accept the list of matched block spans and remove **all** of them from the displayed reply, keeping prose between and after blocks and trimming trailing blank lines as today. Remove the spans from last to first so earlier line offsets stay valid as lines are spliced. A block's span still comes from the extractor, so no line-scanning logic is duplicated.
6. `src/acp/loop.ts`: set `CORRECTION_PROMPT` to the new sentence quoted above and keep it on the correction path for a whole-reply `mistake`.
7. Check the file size after the change. The parallel-launch, result-queue, and cap accounting are about forty lines on top of a file that is currently about 114 raw lines (roughly 92 with blanks and comments skipped); keep `src/acp/loop.ts` under the 200-line `max-lines` limit and extract a focused helper into a sibling module only if the limit is actually reached, never by compacting code. The new branching may also raise `sonarjs/cognitive-complexity` (warn at 15 in `eslint.config.mjs`); keep the pump and cap logic in small local helpers before adding a module.

## Tests

Extend `src/acp/loop.test.ts` (colocated Vitest, existing event harness):

- several `janissary` blocks in one reply all start in parallel (no command waits for an earlier result) and each is recorded through `ranCommand`;
- one follow-up per finished command, in completion order, each with the unchanged `Output of` block and closing lines;
- all matched blocks are removed from the displayed reply, with prose between and after them kept;
- after a batch the agent can answer with a reply containing no command, which finishes as `answered`;
- a new batch issued in a follow-up reply joins the same result queue behind results already waiting, so follow-ups stay in completion order;
- a batch that exhausts the step budget runs only the commands that fit and refuses each over-budget command with exactly `ACP: step limit reached; command not run.`, without calling `runCommand` for those;
- a malformed block sends the correction, runs nothing, and does not spend a step;
- abort while a batch is in flight sends no further prompt;
- a command that throws or a promise that rejects is delivered as an ordinary result and the run keeps going, with no `finished('failed', ...)` from this loop;
- the zero-command correction uses the new `CORRECTION_PROMPT` sentence;
- update the `lineSpan` adapter at the top of `src/acp/loop.test.ts` (quoted identifier `lineSpan`) so its fake extractors return a one-entry `batch` result instead of the removed `one` variant, and keep the existing single-command, cold-start, primer, display-strip, and cap tests passing under that shape.

Existing suites that mock or drive the loop, including `src/acp/drive-loop.test.ts`, `src/acp/run-prompt.test.ts`, `src/agent/execute.test.ts`, `src/subagent/attempt.test.ts`, and `src/remote/serve-acp-loop.test.ts`, must keep passing with the batch result and the new follow-up flow.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` after the source change and again after the tests; both must be clean.
- Confirm `src/acp/loop.ts` stays under the 200-line `max-lines` limit and that no implementation code was added to any plan.

## Out of scope

- No primer or spec text. Those are subplan 4, except that this subplan owns the `CORRECTION_PROMPT` constant itself.
- No remote caller-command forwarding fix. That is subplan 5; remote loops inherit this loop through `driveToolLoop`.
- No change to the cap value, the cold-start retry, the no-block final-answer rule, or the correction for an empty or malformed block.
- No configurable batch size, per-command timeout, or per-result message format other than the existing `Output of` block.
- No new module unless the 200-line limit is genuinely reached, no wire frame, and no client UI.
