# Correlate identical remote caller commands that settle out of order

**Complexity: 2/10** — one production file with a one-line correlation guard, 3 behavioral requirements and 3 test scenarios, no new units (p=3.52).

## Goal

A remote run that issues two identical caller commands in one batch can leave one result permanently pending when the results arrive in reverse request order. The first `ranCommand` for the pair consumes the wrong pending entry, so the other request's `acp-tool-result` finds no entry, its deferred promise never settles, `inFlight` never returns to zero, and no follow-up or `acp-run-end` frame is emitted. The run hangs until the user aborts. Consumption must instead follow the one result that has actually settled, and a workspace or gate step whose text happens to match a pending caller command must keep emitting its step.

## Approach

1. In `src/remote/serve-acp-loop.ts`, tighten the `ranCommand` pending lookup so an entry is deleted only when both its command text matches and it is settled. An unsettled entry (a caller command still awaiting its result) stays in the map, so a later result can settle its own deferred. When no settled match is found, the handler falls through and emits the ordinary `acp-tool-step` frame.
2. Leave the `PendingCall.settled` flag, the `toolResult` duplicate guard, the request numbering, and the wire protocol unchanged. The loop already awaits each caller deferred before calling `ranCommand`, so a command's own result is always marked settled first; correlation by settled command text is therefore unambiguous.

## What already exists (reuse, don't rebuild)

| Existing piece | File | Relevance |
| --- | --- | --- |
| `pending` request-number map and `PendingCall.settled` | `src/remote/serve-acp-loop.ts` | The single place to tighten; the settled flag already carries the correlation signal. |
| `toolResult` duplicate guard | `src/remote/serve-acp-loop.ts` | Already ignores unknown or already-settled requests; stays as is. |
| Parallel caller correlation suite | `src/remote/serve-acp-loop.test.ts` | Holds the identical-command and workspace/gate step cases extended by this fix. |
| Per-command step metadata | `src/acp/drive-loop.ts` | Already pairs each completion with its own host/refusal decision; unchanged here. |

## Implementation steps

1. `src/remote/serve-acp-loop.ts`: in the `ranCommand` handler, change the match condition to `call.command === command && call.settled` so only a settled pending entry is consumed; leave an unsettled entry in place and fall through to the existing `acp-tool-step` send.

## Tests

- `src/remote/serve-acp-loop.test.ts`, under `startRemoteLoop parallel caller correlation`:
  - two identical caller commands in one batch whose `acp-tool-result` frames arrive in reverse request order, with a flush between deliveries: both requests are consumed, both outputs reach their follow-up prompts, no `acp-tool-step` is emitted, and the run ends `answered`;
  - extend the workspace-step case so a pending caller request shares the workspace command's text and assert that command's `acp-tool-step` is still emitted;
  - extend the gate-refusal case so a pending caller request shares the refused command's text and assert that command's `acp-tool-step` is still emitted.
- The existing `startRemoteLoop` suites and the per-command metadata tests in `src/acp/drive-loop.test.ts` must keep passing unchanged.

## Out of scope

- No wire-protocol, frame-type, request-numbering, or `acp-run-end` change.
- No change to the `PendingCall.settled` flag or the `toolResult` duplicate guard.
- No change to per-command metadata in `src/acp/drive-loop.ts` or to the configurable step cap.
- No spec or public-documentation text change: remote caller correlation is already described in `product/specs/acp.md`, and this restores that documented behavior.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` after the source change and again after adding tests; both must be clean.
- Confirm no edited file exceeds the 200-line `max-lines` limit.
