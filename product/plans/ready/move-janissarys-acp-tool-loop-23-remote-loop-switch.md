# ACP tool loop 23 — remote tabs and remote agent runs hand their loop to the far side

**Complexity: 5/10** — ~25 added lines across 5 production files, 8 requirements, 10 scenarios (p=5.49)

Run order: 23 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (the `runToolLoop`, session-type-split, and holder paragraphs of "Local side"; decisions 1, 3, and 10). Depends on subplans 13, 19, 20, 21, and 22 (`move-janissarys-acp-tool-loop-13-agent-run-switch.md`, `move-janissarys-acp-tool-loop-19-far-side-run-wiring.md`, `move-janissarys-acp-tool-loop-20-far-side-cancellation.md`, `move-janissarys-acp-tool-loop-21-remote-session-run.md`, `move-janissarys-acp-tool-loop-22-remote-session-tool-requests.md`). Subplan 24 adds host tags, and subplan 25 deletes the frames this subplan stops using.

This is the switch the series has been building toward. A remote tab's `ask`, `tell`, or plugin `promptAcp`, and an `agent … on <host>` run, now send `acp-run` and let the far side run the loop. Workspace tools then resolve against the remote clone. Caller tools still run here, through the far side's tool requests.

## Design decisions

- **One entry point, two session kinds** (source decision 1). `runToolLoop` at `src/acp/drive-loop.ts:81` takes `AcpLoopSession | RemoteAcpSession` and branches on `'remote' in session`. Narrow with that check, not `tab.remote`; the session is what decides, because the same tab can fall back to a local `connectAcp` session when it has no remote channel (`src/acp/session-manager.ts:75-92`).
  - A `RemoteAcpSession` gets `session.run(prompt, snapshot, host.runCaller, events)` and the function returns. `run` is fire-and-forget: do not await it. A refused admission arrives as `events.error` from `AcpPromptControl.admit` (`src/acp/prompt-control.ts:20`) and sends no frame.
  - A local `AcpLoopSession` is driven in-process through `driveToolLoop` (`src/acp/drive-loop.ts:58`), exactly as today.
  - If the signal is already aborted before dispatch, return without calling `session.run`, matching the loop's existing `dependencies.signal?.aborted` checks (`src/acp/loop.ts:27` and `:37`). A remote run admitted after cancellation would keep the far side busy with no local prompt left to cancel it.
  - `runCorePrompt` (`src/acp/run-prompt.ts:70`) and `executeAgentRun` (`src/agent/execute.ts:51`) take `AcpSession | RemoteAcpSession`. A remote session is passed to `runToolLoop` unwrapped; only a local `AcpSession` goes through `guardedSession` (`src/acp/run-prompt.ts:57`) or execute's inline prompt guard. Narrow before wrapping, because `guardedSession` accepts only `AcpSession`. Both callers keep passing `guardAcpHandlers(..., active)` (`src/acp/guard-handlers.ts:4`) as the loop events, so remote frames are guarded at settlement just like local loop events.
  - Cancellation is unchanged: `AcpManager.cancel` (`src/acp/manager.ts:168`) calls `session.cancel()` on the union, and the adapter sends `acp-cancel` and drains on `acp-run-end cancelled` (`src/remote/acp-session-run.ts:93`). The remote arm of `runToolLoop` adds no cancellation or abort plumbing.
  - Import `RemoteAcpSession` with `import type` in `drive-loop.ts`. The far-side server imports `driveToolLoop` (`src/remote/serve-acp-loop.ts:1`), so a value import would pull the local adapter into the far-side process.
- **Session type split.** `RemoteAcpSession` at `src/remote/acp-session.ts:35` becomes `Omit<AcpSession, 'prompt'>` plus `run`, `ready`, `release`, and `remote: true`. No new lifecycle type is needed.
  - The adapter's `prompt` implementation at `src/remote/acp-session.ts:168` is deleted. Nothing sends `acp-prompt` after this subplan.
  - Leave `onEnd`/`acp-end`, the far side's `RemoteAcp.prompt`, and the protocol alone. Subplan 25 owns their deletion and the version bump; deleting them here would pre-empt it.
  - The holder in `src/acp/session-manager.ts` stores `AcpSession | RemoteAcpSession`. The `CoreSession.session` field (`:15`), the `session` and `currentSession` return types (`:35`, `:131`), and the `isCurrent` parameter (`:142`) carry the union.
  - Every other read of the holder's session only compares identity, passes it to `runCorePrompt`, or calls `cancel`, `kill`, or `shutdown`; no code calls `prompt` on it. `AcpManager` (`src/acp/manager.ts`) needs no edit: `acquire` at `:196` infers the union, and the hand-off at `:135` is the only use that is not a lifecycle or identity check. The file is at 200 effective lines, so do not add lines there.
- **Caller tools round-trip** (source decision 3). For both a remote tab and a remote run, `runCaller` is the same local runner as before: `dispatchNative` (`src/acp/run-prompt.ts:37`) for a tab, and `runGrantedAgentCommand` with the question status (`src/agent/execute.ts:146-155`) for a run. So `db` writes to the local `.janissary/db/sqlite/` and shows in the local connections panel, `browser` drives the local browser, and `question` opens the local panel. Its answer travels back as the tool result. The adapter already handles the round trip in `createRemoteAcpRun.request` (`src/remote/acp-session-run.ts:68`), so this subplan adds no new runner and no new frame.
- **Remote agent runs.** `executeAgentRun` passes its `RemoteAcpSession` to `runToolLoop`, so the far side runs workspace tools itself. The far side's workspace root is the clone `RemoteAgentTarget.workspace` provisioned (`src/agent/remote-target.ts:9`), supplied by `RemoteAcp` to `startRemoteLoop` (`src/remote/serve-acp.ts:123`, `src/remote/serve-acp-loop.ts:38`). `run.executionDir` is a local path and must not be sent: `acp-open` carries no cwd by design (`src/remote/acp-session.ts:9-13`). The interim `Remote connection unavailable.` workspace branch at `src/agent/execute.ts:144` is deleted; the local arm keeps `readWorkspaceCommand(run.executionDir, …)`.
- **Transport loss** (source decision 10). For a tab, the `onTransportLost` hook in `src/acp/session-manager.ts:80-84` settles the prompt with the existing `Remote connection lost.` and `closeTab` drops the holder, so the next `ask` or `tell` starts a fresh session. The adapter's `detach` also releases the control, whose `events.error` carries `Remote connection lost before agent readiness.`; the `active()` guard drops that late event, so do not surface it in the tab transcript. For an agent run the hook aborts `run.abortController` (`src/agent/execute.ts:82`), so the run settles as `Agent terminated.`; if readiness never landed, the run fails with `Agent: Remote connection lost before agent readiness.` from the rejected `ready`. The far side has already aborted the loop through `RemoteAcp.detachRuns` (`src/remote/serve-acp.ts:171`).

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Entry point | `runToolLoop` in `src/acp/drive-loop.ts:81`; `driveToolLoop` at `:58` (subplan 10) |
| Session contracts | `AcpSession` at `src/acp/types.ts:10`; `AcpLoopSession` at `:71`; `guardAcpHandlers` at `src/acp/guard-handlers.ts:4` |
| Remote run method and discriminant | `RemoteAcpSession.run`, `remote: true` (subplans 21 and 22) in `src/remote/acp-session.ts:35` |
| Remote run frames and caller-tool round trip | `createRemoteAcpRun` in `src/remote/acp-session-run.ts:28`; `startRemoteLoop` in `src/remote/serve-acp-loop.ts:16` |
| Holder and lifecycle calls | `CoreSession`, `session`, `currentSession`, `isCurrent` in `src/acp/session-manager.ts` (`:15`, `:35`, `:131`, `:142`); `AcpManager` in `src/acp/manager.ts` (200 effective lines, so it must not grow; the union flows through `acquire`'s inferred return type) |
| Core and agent call sites | `runCorePrompt` in `src/acp/run-prompt.ts:70`; `executeAgentRun` in `src/agent/execute.ts:51` |
| Caller-side runners | `dispatchNative` in `src/acp/run-prompt.ts:37`; `runGrantedAgentCommand` in `src/agent/execute.ts:151` |

## Proposed changes

- `src/acp/drive-loop.ts`: widen `runToolLoop` to the union, add the remote branch and the already-aborted guard, and type-import `RemoteAcpSession`. No change to `driveToolLoop`.
- `src/remote/acp-session.ts`: the type split and the deleted `prompt`; keep `onEnd`, `shutdown`, `cancel`, and `kill`.
- `src/acp/session-manager.ts`: the union holder and accessor types. No lifecycle behavior change.
- `src/acp/run-prompt.ts`: accept the union, branch before `guardedSession`, and pass the remote session through. `runWorkspace` stays for local tabs and is not called on the remote branch.
- `src/agent/execute.ts`: branch before the inline prompt guard, pass `remoteSession` through, and delete the interim workspace string.
- Not changed: `src/acp/types.ts`, `src/acp/manager.ts`, `src/acp/loop.ts`, `src/remote/serve-acp.ts`, `src/remote/serve-acp-loop.ts`, `src/remote/acp-session-run.ts`, and every protocol or version file.

## Tests

- `src/acp/drive-loop.test.ts` (`describe('runToolLoop')` at `:222`): a fake remote session with `remote: true` gets the prompt, snapshot, `host.runCaller`, and events, and the local loop does not run; an already-aborted signal sends nothing; the two existing local cases stay green.
- `src/acp/run-prompt.test.ts`: keep the existing local harness and its `runAcpToolLoop` mock. Add a second harness (or a session option on the existing one at `:61`) that supplies a fake `RemoteAcpSession` and captures the arguments to `run`. With it:
  - `runCorePrompt` calls `run` with the request prompt, the role snapshot, a `runCaller`, and the guarded events, and calls no local loop.
  - invoking the captured `runCaller` dispatches a granted `db` command through `dispatchNative` with the prompt signal.
  - a `ranCommand` with `refused: 'disabled'` raises the `command-disabled` notification.
  - `finished('capped', 8)` appends the `(stopped after 8 tool steps)` paragraph.
  - an already-aborted request does not call `run`.
  - Replace the `takes the remote path on a remote tab` case at `:329`: a remote tab now uses a `RemoteAcpSession`, so the test should prove the local host receives no workspace request, not assert `Remote connection unavailable.`.
- `src/agent/execute.test.ts`:
  - `captures exact task/skills/parameters, native and host activity (remote: %s)` at `:41`: for the remote arm, drive `listener.onTurn(...)` and `listener.onRunEnd(...)` and answer a simulated `acp-tool-request`; do not reach the `runAcpToolLoop` mock. Keep the local arm as it is.
  - `uses remote readiness confinement state` at `:252`: same frame-driven finish for the remote run; `runAcpToolLoop` is never called.
  - `refuses a remote workspace read even when the same path exists locally` at `:198` is deleted. Replace it with a test that the remote run sends `acp-run` with the agent snapshot, does not call `connectAcp` or `runAcpToolLoop`, and renders an `acp-tool-step` workspace step. The far-side read itself is covered by `src/remote/serve-acp-loop.test.ts`.
  - Add the requested behavior test: a remote run's granted `janissary db …` tool request runs through `runGrantedAgentCommand` and its result is written back as `acp-tool-result`.
- `src/acp/manager.test.ts` (`describe('AcpManager — remote tabs')` at `:678`):
  - `backs the session with the channel and never spawns an agent locally` at `:710`: flip `runAcpToolLoop` to `not.toHaveBeenCalled()` and assert the `acp-run` frame carries the role snapshot.
  - `retrying once the channel has attached then works` at `:820`: replace the `runAcpToolLoop` call count with an `acp-run` frame assertion.
  - `keeps ask and tell remote sessions on separate ids over one channel` at `:745`, `keeps the session alive on a non-fatal error` at `:864`, and `streams chunks and the stop reason` at `:876` call `session.prompt` on a remote session, which no longer exists. Drive `session.run` with an `AcpLoopHandlers` spy instead, send `acp-turn` start/end and `acp-run-end`, and assert cumulative `chunk` plus `finished('answered', 8)`. The `acp-prompt` expectations at `:771-772` and `:885` become `acp-run` with the role's snapshot.
  - Extend the `acpListener` helper at `:701` with `onTurn`, `onRunEnd`, `onToolRequest`, and `onToolStep`, and rewrite the comment above the describe: the tool loop now does learn that the session is remote.
- `src/acp/index.test.ts`: the fake far side's switch at `:273` routes `acp-run` to `holder.run` and `acp-tool-result` to `holder.toolResult`; drop the `acp-prompt` case so a regression that sends it fails loudly.
- `src/remote/acp-session.test.ts`: delete the `prompting` describe at `:139`; its run equivalents already live in `running`. Port only the still-relevant cases that `running` lacks — idle cancel, cancellation released by fatal error/transport loss/kill, a stray chunk with no run, and a non-fatal error that starts a successor — onto `run`. Update the activity test at `:81` and the `errors`/`killing` cases at `:466`, `:482`, `:500`, `:510`, and `:549` to use `run` and `AcpLoopHandlers`; do not mechanically rename prompt calls to run calls without a terminal frame, which would hang.
- `src/acp/record-feed.test.ts` (`setup(remote)` at `:30`): the remote arm's `end` helper at `:70` currently sends `listener.onEnd('end_turn')`, which no longer finishes a run. Send an `acp-turn` start before the first chunk and an `acp-turn` end carrying the reply before `onRunEnd('answered')`. The three remote `it.each` cases at `:200`, `:211`, and `:231` then cover the real remote path.

## Out of scope

Host tags (subplan 24). Deleting `acp-prompt` and `acp-end`, removing `AcpSessionListener.onEnd`, and the version bump (subplan 25); `REMOTE_PROTOCOL_VERSION` stays 39. Changing the far side's `RemoteAcp.prompt`. Typed `file read` and its remote filesystem operation (subplans 4 and 5). Mid-run `ask reset`/`tell reset` cancellation behavior (subplan 20). Running `db`, `browser`, or `question` on the remote host, or showing a remote host's databases or browsers locally. Monitors, conversations, and editor persona ACP consumers, which do not enter the tool loop and keep using local `connectAcp` sessions.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then, on a remote shell tab, run steps 2, 4, 5, 6, and 8 of subplan 27. Step 2 proves the core far-side loop with a remote file the local checkout lacks; step 4 the local database; step 5 the local question panel; step 6 the reset; step 8 the remote agent run. Ignore the `[<host>]` tags until subplan 24 — untagged output is correct here. Step 3 and step 7 are the typed read from subplan 5, step 9's tag belongs to subplan 24, and step 10 is transport loss. Confirm `src/remote/protocol.ts:212` still reads 39, `src/acp/manager.ts` stays at 200 effective lines, and `src/remote/acp-session.ts` stays under the limit.
