# Bound pending recorder output

Complexity: 4/10 (threshold: 7).

## Goal

Prevent slow recording storage from accumulating unlimited queued bytes in the server while leaving PTY execution independent.

## Approach

Give headers and events one enqueue boundary in `src/harness/recorder.ts`. Limit outstanding encoded bytes to 4 MiB per recorder, counting the stream's pending bytes and the next line. Exceeding the budget abandons recording, destroys its stream, unsubscribes from PTY events, and reports failure once. Keep normal disposal idempotent and preserve format and timing. Update the abandonment comment to describe all failure paths.

## Implementation steps

1. Add the byte budget and bounded write path to the recorder, together with a new `src/harness/recorder-backpressure.test.ts` using a stalled writable stream. Retain existing real-file recorder and observer tests.
2. Update the failure behavior in `product/specs/harness-recording.md`, `product/specs/ssh-tab.md`, and `documentation/user-documentation/advanced-agents/harness.md`. No help command changes are needed.
3. Complete this plan and remove only the resolved backlog entry.

## Tests

Verify a stalled stream never accepts bytes beyond the budget, abandonment reports once and releases its subscription, subsequent data/resize/exit events do not write, and repeated disposal is harmless. Verify UTF-8 byte accounting, an oversized header, and resumed writes after normal drain below the budget. Keep other PTY listeners receiving output throughout. Run `./scripts/run.mjs check-diff` after each step.

## Out of scope

PTY throttling, disk quotas, replay resource limits, recording retries, and other backlog entries. A congested recording can remain incomplete and carries no invented exit event.
