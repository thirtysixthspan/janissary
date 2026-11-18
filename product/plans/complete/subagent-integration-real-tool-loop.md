# Exercise the real tool loop in the local subagent integration suite

**Complexity: 1/10** — test-only change: no production lines, files, requirements, scenarios, or new units (p=1.578).

## Goal

Make `src/subagent/integration.test.ts` verify the integrated launch-to-delivery sequence through the real ACP tool loop instead of a no-op stub. The suite must drive provider turns through the provider `prompt` handlers recorded by the seeded fixture sessions, put the currently dead `realRunToolLoop` capture to use, and stop hand-calling the recorded `endTurn`/`finished`/`error` loop handlers. No production behavior changes.

## Approach

The fixture mocks `../acp/drive-loop.js` so the imported `runToolLoop` delegates to `mocks.runToolLoop`, while capturing the actual implementation into `mocks.realRunToolLoop` at module load. Today `beforeEach` installs an empty implementation on `mocks.runToolLoop`, so every scenario records a call and calls the loop handlers by hand; the real `driveToolLoop` → `runAcpToolLoop` chain never runs. The remote suite already rides the real channel and needs no change.

Adopt the established call-through pattern: `attempt.test.ts` uses `mocks.runToolLoop.withImplementation(actual.runToolLoop, fn)` through a `withRealLoop` helper, and `src/acp/run-prompt.test.ts:208` does the same for `runAcpToolLoop` while driving turns through the latest provider prompt handlers (`reply` calls `onChunk` then `onEnd`). Apply both ideas locally inside the test file; do not import another test suite or expose production internals.

Because `withImplementation` only swaps the implementation and still records calls, the existing `mocks.runToolLoop.mock.calls` reads (`loopPrompt`) and the manager/deferred gates stay valid. The real loop produces the same logical prompt argument to `runToolLoop`, so the verbatim-task and exact one-line started/completion JSON assertions remain unchanged.

## Implementation steps

1. In `src/subagent/integration.test.ts`, add a `withRealLoop(run)` helper that awaits `mocks.runToolLoop.withImplementation(mocks.realRunToolLoop, run)`, and type the hoisted `realRunToolLoop` capture as a callable so it can be passed to `withImplementation`.
2. Remove the no-op `mocks.runToolLoop.mockImplementation(() => {})` from `beforeEach`. Keep `mockReset()` so the default implementation stays empty outside wrapped scenarios and each scenario opts into the real loop explicitly.
3. Store each connected fixture session's `prompt` mock in a per-connect-index array (captured where `connectAcp` pushes `connectCalls`), so helpers can address the provider handlers by the same index already used by `handshake`, `answerLoop` and `failLoop`. Add `answer(index, text)` (latest provider prompt's `onChunk(text)` then `onEnd('end_turn')`), `fail(index, message)` (`onError(message)`), and a `latestProviderPrompt(index)` helper. Remove the hand-driving `answerLoop`, `failLoop` and now-unused `loopCall` helpers.
4. Wrap each scenario in `withRealLoop` and replace `answerLoop`/`failLoop` calls with `answer`/`fail`:
   - Completed/verbatim, started-completion, empty final turn, prehandshake failure, fallback, termination, concurrency and ACP-delivery scenarios drive their final turn through the provider handlers.
   - The empty-final-turn scenario answers twice: the real loop retries the first empty reply once (cold-start retry in `runAcpToolLoop`), so the second provider prompt is driven with the empty answer and yields the blank completion.
   - The capped/partial scenario drives eight `file read x.md` command turns plus a final `file read x.md`-with-answer turn through the provider handlers. The real loop's `CORE_MAX_STEPS` then emits `finished('capped', 8)`; the command line is filtered from the displayed final text, leaving the expected `eight commands done` output. This exercises the real primer construction and command gating rather than hand-calling `finished`.
5. Run `$janissary/scripts/run.mjs check-diff` after the change and fix any failures. No file approaches the 200-line production limit; the test file is exempt.

## Tests

`src/subagent/integration.test.ts` is the changed suite. No scenario assertions are added or weakened: the existing scenarios (synchronous receipt, verbatim distilled output, started/completion coalescing, empty final turn, prehandshake failure, task-resolution failure, capped partial, fallback, termination, concurrency, unknown role, malformed flag, and the three ACP caller-delivery payload cases) keep their assertions. The deferred provisioning gate, workspace/model/record manager spies, and the exact one-line started/completion JSON strings stay unchanged. The remote suite `src/subagent/remote.integration.test.ts` already exercises the real channel/frame path and is not edited.

## Spec updates

None. This is a test-methodology change: no user-visible behavior, documented output, or spec claim changes. `product/specs/subagent.md` already describes the completed/partial/failed and started/completion behavior these assertions check.

## Docs

None needed. No `help/` page or `documentation/user-documentation/` page describes test coverage.

## Out of scope

- Any production change: `src/acp/drive-loop.ts`, `src/acp/loop.ts`, `src/subagent/attempt.ts`, or anything under `src/subagent/` other than `integration.test.ts`.
- Editing `src/subagent/remote.integration.test.ts`, `src/subagent/attempt.test.ts`, or `src/acp/run-prompt.test.ts`.
- Changing the deferred gate, manager spies, exact JSON assertions, scenario assertions, or PR description.
- Running `npm run check` or merging/closing the PR.
