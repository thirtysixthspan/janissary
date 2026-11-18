# Emit a terminal event when an ACP tool command fails

**Complexity: 3/10** — ~12 added lines across 4 production files, 5 behavioral requirements and 5 test scenarios, with no new modules (p=4.75).

## Goal

When a native command run by the autonomous ACP tool loop throws or its promise rejects, the loop currently emits `error` and returns without emitting its terminal `finished` event. Consumers that key their end-of-run cleanup off `finished` therefore miss the state-change notification and dirty broadcast that settle the prompt, clear the running entry, and refresh the connection row. The loop must emit a terminal event on the failure path too, with a reason that conveys failure, and the core prompt handler must map that reason to the same cleanup while keeping the error line as the reply.

## Approach

1. Add `failed` to the reason union carried by `AcpLoopHandlers.finished` in `src/acp/types.ts`. It joins `answered` and `capped` as an end-of-loop outcome; it is not a new handler.
2. In `src/acp/loop.ts`, keep the existing `h.error(errorText(error))` on the `runCommand` catch path, then emit `h.finished('failed', maxSteps)` before returning. Normal answers and the step cap keep emitting their current reasons.
3. In `src/acp/run-prompt.ts`, let the `finished` handler recognize `failed`: perform the shared end-of-run work (state-change notification, rate-limit check, dirty broadcast) and skip the `answered: true` settle, because the `error` handler has already settled the prompt with `ACP error: <message>`. The error line stays the reply.
4. In `src/remote/serve-acp-loop.ts`, do not forward a `failed` reason onto the wire as `acp-run-end`. The remote server already treats the non-fatal `acp-error` frame from the same catch path as terminal, so a second terminal frame would duplicate the end signal and would need an unrelated protocol change.

## What already exists (reuse, don't rebuild)

| Existing piece | File | Relevance |
| --- | --- | --- |
| `runAcpToolLoop` catch path | `src/acp/loop.ts` | Emits `h.error` then returns; the only source change that creates the missing terminal event. |
| `AcpLoopHandlers.finished` | `src/acp/types.ts` | Reason union widened by one literal; all other handler fields unchanged. |
| Core `finished` / `error` handlers | `src/acp/run-prompt.ts` | `error` already settles with the error line; `finished` adds the dirty broadcast and skips the duplicate settle for `failed`. |
| Remote loop host | `src/remote/serve-acp-loop.ts` | Guards the wire frame so the new reason does not leak into the protocol. |
| `AcpPromptControl` / `serve-acp.ts` | `src/acp/prompt-control.ts`, `src/remote/serve-acp.ts` | Non-fatal `acp-error` already ends a remote run; no change. |
| Loop suites | `src/acp/loop.test.ts`, `src/acp/drive-loop.test.ts` | Existing handler-event harnesses pin answered/capped/error behavior and are extended for the failure path. |

## Implementation steps

1. `src/acp/types.ts`: extend the `finished` reason union to `'answered' | 'capped' | 'failed'` and update its comment.
2. `src/acp/loop.ts`: in the `runCommand` catch block, emit `h.finished('failed', maxSteps)` after `h.error(errorText(error))` and before the return.
3. `src/acp/run-prompt.ts`: in the `finished` handler, move the dirty broadcast ahead of the settle and return early when `reason === 'failed'`, leaving the settle with the error line to the `error` handler.
4. `src/remote/serve-acp-loop.ts`: guard the `finished` handler so a `failed` reason sends no `acp-run-end` frame.

## Tests

- `src/acp/loop.test.ts` (extend the existing event harness):
  - a command that throws synchronously emits `error` then a `finished('failed', maxSteps)` terminal event and starts no further turn;
  - a command that rejects asynchronously emits the same pair of events.
- `src/acp/drive-loop.test.ts` (extend `'reports a host rejection before any abort as one error'` and add a sibling): assert that a rejecting host is followed by `['finished', 'failed', CORE_MAX_STEPS]`, with no `ranCommand` and no follow-up prompt.
- Existing suites `src/acp/run-prompt.test.ts`, `src/acp/manager.test.ts`, `src/acp/guard-handlers.test.ts`, `src/remote/serve-acp-loop.test.ts`, and `src/agent/execute.test.ts` must keep passing unchanged — they are the regression net for answered/capped/error behavior.

## Out of scope

- No change to the `acp-run-end` wire protocol, its decoder, or remote run-end reasons.
- No change to cancellation, reset, model fallback, or handshake behavior.
- No change to error message text or connection-record naming.
- No new spec concept: the ACP spec already states that prompts settle once; this corrects an internal path so the existing statement holds for tool-command failures.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` after the source change and again after adding tests; both must be clean.
- Confirm no edited file exceeds the 200-line `max-lines` limit.
