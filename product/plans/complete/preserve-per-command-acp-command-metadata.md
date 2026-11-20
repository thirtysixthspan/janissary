# Preserve per-command host and refusal metadata for parallel ACP batches

**Complexity: 4/10** — ~25 added lines in 1 production file, 6 behavioral requirements and 8 scenarios (p=4.78).

Source: pull request #2137 backlog entry, `product/backlog/pull-request.md` (`feature/acp-multiple-tool-calls-per-reply`). Follows subplan 3, `./product/plans/complete/allow-acp-sessions-to-accept-multiple-tool-calls-in-a-single-message-for-example-3-parallel-batch-loop.md`, which made a reply's commands launch in parallel and exposed this bug.

## Goal

When one ACP reply issues several commands in parallel, each `ranCommand` event must carry the host (`workspace`) and refusal (`refused`) decision that belongs to the specific command that completed, not the decision of the last command launched. A batch mixing caller and workspace commands must tag each result with its own host; a batch mixing a disabled command with an enabled one must raise the "command disabled" marker only for the disabled command. Single-command behavior, the `startCommand` arguments, `runCommand`'s return contract, event ordering, and error results must not move.

## Root cause

`gatedRunner` in `src/acp/drive-loop.ts` passes each `DrivenStep` to a `remember` callback that overwrites one shared `step` slot. `driveToolLoop`'s `ranCommand` wrapper reads that slot when the loop reports a result. Because `runAcpToolLoop` now calls `runCommand` for every command in a batch before any result settles, the slot holds only the last-launched command's decision by the time any `ranCommand` fires, and results complete in an order independent of launch order.

## Decisions

- Bind each decision to its own result by completion, not by a shared slot and not by command text. `gatedRunner` pushes a command's `DrivenStep` onto a completion queue at the moment that command's result settles; `ranCommand` consumes the step for the command that just completed. Identical command strings in one batch still keep their own decisions.
- Keep `runCommand`'s signature and return value exactly as they are (`string | Promise<string>`). The loop and every direct caller of the runner see the same strings; only the internal queue changes. Do not widen `AcpLoopDeps.runCommand` or change `AcpLoopHandlers`.
- A synchronous result (a refusal, or a host that returns a string) pushes its step when `runCommand` is called, immediately before the loop records that result. An asynchronous result pushes its step when its promise settles, in both the fulfilled and rejected paths, just before the loop records that result. A synchronous throw from the host pushes its step too. Because a step is pushed in the same turn that its `ranCommand` is emitted, the queue stays aligned with completion order.
- Keep `startCommand` calls exactly as they are: `gatedRunner` still emits them at call time with the correct per-command `workspace` argument, including `false` for refusals.
- Preserve the error path: a host that throws or rejects still yields the loop's `ACP error: <message>` output as an ordinary result, with that command's decision still attached. An aborted result is dropped by the loop before `ranCommand`, so it emits no event.
- Keep the queue local to one `driveToolLoop` invocation, so no metadata leaks between prompts.

## What already exists (reuse, don't rebuild)

| Need | Existing piece | Location |
| --- | --- | --- |
| Per-command gate decision (`runsOn` / `refusal` / `refused`) | `gateCommand`, `CommandDecision` | `src/acp/tool-table.ts` |
| Command runner and shared-slot bug | `gatedRunner`, `remember`, `step` | `src/acp/drive-loop.ts` |
| Sync/async host result normalization and abort handling | `dropLateRejection`, `settleUnlessAborted` | `src/acp/drive-loop.ts` |
| Loop result recording via `h.ranCommand` | `settle`, `runAcpToolLoop` | `src/acp/loop.ts` |
| Single-command routing, workspace-tagging, refusal, and abort coverage | Colocated Vitest suite | `src/acp/drive-loop.test.ts` |
| Parallel-launch and error-result coverage | Colocated Vitest suite | `src/acp/loop.test.ts` |

## Proposed changes

1. `src/acp/drive-loop.ts`: replace the single `step` slot with a completion queue local to `driveToolLoop`. `gatedRunner` takes the queue instead of the `remember` callback and pushes each command's `DrivenStep` when that command's result settles (at call time for a synchronous result or a synchronous host throw, and in both handlers of the settled promise for an async result). It still returns the same `string | Promise<string>` as today and still emits `startCommand` with unchanged arguments.
2. `src/acp/drive-loop.ts`: change the loop's `ranCommand` wrapper to consume the next queued step and pass its `workspace` and `refused` to `events.ranCommand`. Use a neutral `{ workspace: false }` step if the queue is ever empty, so a result without a recorded decision is still reported.
3. Check the file size: `src/acp/drive-loop.ts` is 99 raw lines, well under the 200-line `max-lines` limit; the small queue change fits. Verify with `check-diff` and extract a helper only if the limit is actually reached, never by compacting code.

## Tests

Extend `src/acp/drive-loop.test.ts` (existing helpers `makeSession`, `makeHandlers`, `block`, `drive`):

- one reply containing two async commands routed to different hosts — one caller command and one workspace command — whose promises resolve out of launch order; assert each `ranCommand` event carries its own `workspace` value (`false` for the caller command, `true` for the workspace command), while `startCommand` still carries the correct per-command value at call time;
- one reply mixing a disabled command with an enabled one; assert the `'disabled'` refusal marker is attached only to the disabled command's `ranCommand` event and the enabled command's event carries no refusal, with the host invoked only for the enabled command.

Existing suites must keep passing unchanged: the single-command routing, workspace-tagging, refusal, event-order, and abort tests in `src/acp/drive-loop.test.ts`; the parallel-launch, follow-up-order, cap, and error-result tests in `src/acp/loop.test.ts`; and the direct `runCommand` consumers in `src/acp/run-prompt.test.ts`, `src/acp/manager.test.ts`, and `src/agent/execute.test.ts`, which require `runCommand` to keep returning plain strings.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` after the source change and again after the tests; both must be clean.
- Confirm no implementation code was added to any plan and that `npm run check` is never run.

## Out of scope

- No spec or help-documentation change: this is an internal metadata bug, not a change to documented behavior.
- No change to `runCommand`'s return type, `AcpLoopDeps`, `AcpLoopHandlers`, `startCommand` arguments, or the loop's queue/pump/cap/abort logic.
- No new module, no wire frame, no client UI, and no change to the PR description.
