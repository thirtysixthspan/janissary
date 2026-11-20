# Correlate several parallel caller commands in a remote ACP run

**Complexity: 2/10** — ~12 added production lines in 1 file, 4 requirements and 5 correlation scenarios (p=4.23).

Source plan: `./product/plans/complete/allow-acp-sessions-to-accept-multiple-tool-calls-in-a-single-message-for-example.md`. Depends on subplan 3: `./product/plans/ready/allow-acp-sessions-to-accept-multiple-tool-calls-in-a-single-message-for-example-3-parallel-batch-loop.md` and subplan 4: `./product/plans/ready/allow-acp-sessions-to-accept-multiple-tool-calls-in-a-single-message-for-example-4-agent-protocol-and-spec.md` (the batch follow-up flow and the spec's remote-correlation wording). No later subplans.

## Goal

Fix the remote-hosted loop so a batch with several caller-side commands produces several correlated `acp-tool-request` / `acp-tool-result` pairs and no tool step is dropped. The far side drives the same loop through `driveToolLoop`, so it already inherits batches, but its single `forwarded` flag assumes one caller command at a time. Replace that flag with correlation over the existing `pending` map.

The canonical feature scope is the source plan above. This subplan carries its fifth proposed change and the remote half of the "every consumer accepts multiple commands" decision.

## Decisions and dependencies

- Depends on subplans 3 and 4 landing first: the loop now launches parallel batches and sends one follow-up per result, and the spec describes remote correlation.
- Reuse the existing `pending` map keyed by request number in `startRemoteLoop`. Record the command on each pending entry when `runCaller` creates it, and let `ranCommand` skip the far-side `acp-tool-step` only for a command that has a matching pending entry. That keeps several parallel `acp-tool-request` frames correlated to their `acp-tool-result` replies without a new map or frame type.
- Ordering matters: `toolResult` resolves the deferred promise for its request, which lets the loop's awaited `runCommand` continue to `ranCommand` in a later microtask. Keep the pending entry alive until `ranCommand` consumes it so the correlation is still present at that point. Extend each entry to hold the deferred, the command, and a settled flag; `toolResult` ignores a duplicate frame for an already-settled entry, otherwise resolves or rejects it and marks it settled, and `ranCommand` removes exactly one entry whose recorded command matches the command it is recording. With duplicate command text, consume one entry per call rather than treating all duplicates as one.
- A gate refusal or a workspace command produces no `acp-tool-request`, so it has no pending entry and `ranCommand` still sends its normal `acp-tool-step`. An aborted run still rejects and clears all pending entries, and the existing `aborted()` guard in `ranCommand` sends no frame. Matching is by command text only; identical command text always takes the same gate side in one snapshot, so a pending caller entry cannot be consumed by a workspace step.
- Do not change the wire frames in `src/remote/protocol-frames.ts`; the existing `acp-tool-request` / `acp-tool-result` correlation is reused as-is. No new frame type, RPC, or client UI.

## What already exists (reuse, don't rebuild)

| Need | Existing piece | Location |
| --- | --- | --- |
| Remote loop driver | `startRemoteLoop`, `driveToolLoop` call | `src/remote/serve-acp-loop.ts` |
| Request-number correlation map | `pending` map of request number to deferred result | `src/remote/serve-acp-loop.ts` |
| Caller command issue | `runCaller`, `acp-tool-request` send | `src/remote/serve-acp-loop.ts` |
| Tool result resolution | `toolResult`, `acp-tool-result` | `src/remote/serve-acp-loop.ts` |
| Step/forward suppression | `forwarded` flag in `ranCommand` | `src/remote/serve-acp-loop.ts` |
| Wire frames | `acp-tool-request`, `acp-tool-result`, `acp-tool-step` | `src/remote/protocol-frames.ts` |
| Existing remote loop coverage | Colocated Vitest suite | `src/remote/serve-acp-loop.test.ts` |

## Proposed changes

1. `src/remote/serve-acp-loop.ts`: remove the single `forwarded` boolean. Extend each `pending` entry to carry the command alongside its deferred result, and populate that command in `runCaller` when it increments `requestNumber`, creates the deferred, and sends `acp-tool-request`.
2. Keep `toolResult` resolving or rejecting the deferred for its request number, but leave the entry for `ranCommand` to consume so the correlation survives until the loop records the step. Set the settled flag when it resolves, and return early for a second `acp-tool-result` with the same request number. Guard against late results after abort with the existing `aborted()` checks.
3. In `ranCommand`, look for a pending entry whose recorded command matches the command being recorded. If one exists, remove that single entry and return without sending `acp-tool-step`, so the local side records the caller step itself as today. Otherwise send the existing `acp-tool-step` frame with `workspace`, `result`, and `refused` unchanged.
4. Keep `startTurn`, `endTurn`, `chunk`, `finished`, `error`, `cancel`, and `abort` behavior unchanged. The batch's serialized follow-ups from subplan 3 already produce one turn per result.

## Tests

Extend `src/remote/serve-acp-loop.test.ts` (colocated Vitest, existing harness):

- a reply with several caller-side blocks produces several `acp-tool-request` frames with distinct request numbers, each answered by a matching `acp-tool-result`, and no `acp-tool-step` is emitted for those caller steps;
- two commands with identical text each consume their own pending entry and are both correlated;
- a workspace command or a gate refusal in the same batch still produces its normal `acp-tool-step`, so no step is dropped;
- abort while several caller requests are pending rejects them all and sends no further frames;
- keep the existing single-command caller-step, workspace-step, snapshot-gate, cancellation, and routing suites passing unchanged.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` after the source change and again after the tests; both must be clean.
- Confirm `src/remote/serve-acp-loop.ts` stays under the 200-line `max-lines` limit (it currently has about 120 effective lines, so there is room) and that `src/remote/protocol-frames.ts` is untouched. Keep any new helper in the same file and import it directly with the `.js` extension if a sibling module is ever needed.

## Out of scope

- No new wire frame, RPC, or client UI; no change to `acp-tool-request`, `acp-tool-result`, or `acp-tool-step` shapes.
- No change to the loop, extraction, ownership, primer, or spec behavior. Those are subplans 1 through 4.
- No change to the cap value, cancellation semantics, or workspace-command routing.
- No per-command timeout or configurable batch size.
