# Require an MCP-enabled harness for remote question calls

**Complexity: 4/10** — About 33 added lines across five production files, with seven verification scenarios (p=5.04).

## Goal

Honor the user's harness launch decision when a remote channel forwards an MCP call. Keep pending call cancellation and final cleanup available throughout channel teardown.

## Requirements

1. “Refuse calls before the relay executor is invoked when the session has no eligible harness”.
2. “Preserve explicit cross-tab targeting for an allowed caller”.
3. Keep access “when that harness is restored from its launch record”.
4. Apply the gate “without losing cancellation and cleanup for a call already accepted”.

## Design decisions

- Check eligibility against the local channel's outgoing launch records. A PTY harness with MCP enabled and offline mode off qualifies.
- An Attach may receive replay before the harness PTY is fully adopted. Use a local, recorded MCP-enabled process ID for that brief interval. Drop that ID on adoption, process exit, kill, or finishing the attach replay.
- Check incoming calls at channel dispatch. Unavailable calls get a correlated tool error on an attached channel. Cancellation still reaches the relay for old calls.

## Preserved behavior

1. Replay on a live relay joins an outstanding call. It must never open a duplicate question. Existing test `attaches a re-sent call to the in-flight question instead of registering a second` in `src/remote/mcp-relay.test.ts`.
2. Closing the remote channel releases its own questions. It must never clear unrelated questions on surviving tabs. Existing test `silently releases only its own questions from a surviving tab on final close` in `src/remote/mcp-relay.test.ts`.
3. An attached harness can ask its own rebuilt tab or another tab. It must never fall back to an unrelated tab holding the original launch name. Existing test `keeps a restored MCP harness targeting its rebuilt tab when its original label is occupied` in `src/sessions/harness-roundtrip.test.ts`.

## Assumptions

1. `src/remote/channel/index.ts:90` calls `router.record(frame)` only for outgoing spawn frames.
2. `src/remote/serve-detach.ts:165` emits the accepted `attach-result` before replay, so the local channel is attached when it receives legitimate replayed calls.
3. `src/sessions/attach.ts:125` reads the MCP decision from the record of the adopted process.

## Existing functionality

1. `src/remote/channel/sessions.ts:93` uses `forget` to remove killed processes from local launch state.
2. `src/remote/channel/sessions.ts:148` handles natural process exit in `exit`.
3. `src/remote/entry-factory.ts:147` dispatches `mcp-call` separately from `mcp-cancel`.

## Implementation steps

Carry the authorized recorded process ID into the remote channel when attaching. Let the process router check its ordinary launch records and the temporary recorded ID, expiring that temporary ID when no longer needed. Use the result from the attached channel when dispatching a call, returning the current correlation ID with an MCP tool error on refusal. Leave pending call cancellation and final close on their existing paths. Run `$janissary/scripts/run.mjs check-diff`.

Move the channel's ACP transport-loss settlement into a focused module because the additional channel method brings `src/remote/channel/index.ts` over its line limit. Keep the listener cleanup and messages identical. Verify with the existing channel tests in `$janissary/scripts/run.mjs check-diff`.

## UI design

1. A session without an MCP-enabled harness opens no question panel. If it calls while attached it receives `MCP is not enabled for this remote session.`

## Tests

- In `src/remote/manager.test.ts`, keep the successful cross-tab question by recording an eligible harness and check refusal with no launch, an opted-out harness, an offline harness, and a non-harness process for requirements 1 and 2. Check that a stopped harness's accepted call can still cancel for requirement 4.
- In `src/sessions/harness-roundtrip.test.ts`, deliver an ordinary question replay immediately after the fake peer accepts Attach, before the PTY adoption, for requirement 3.
- In `src/remote/channel/sessions.test.ts`, check that an exit for a recorded resume ID retires the temporary eligibility before adoption for requirement 1.

## Out of scope

Existing remote endpoint credentials and local HTTP MCP authorization.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Launch an MCP-enabled remote harness from the local app, ask it to open a Janissary question on another tab, and confirm the panel opens and the answer reaches the harness. Detach and attach the same harness and repeat through its restored tab. Repeat launch with `--no-mcp` and confirm the harness receives no Janissary tool. The mocked channel tests cover the additional server-side refusal and pending cancellation.
