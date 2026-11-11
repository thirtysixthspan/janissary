# ACP tool loop 23 — remote tabs and remote agent runs hand their loop to the far side

**Complexity: 5/10** — ~25 added lines across 5 edited files, 7 requirements, 8 scenarios (p=5.33)

Run order: 23 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (the `runToolLoop`, session-type-split, and holder paragraphs of "Local side"; decisions 1, 3, and 10). Depends on subplans 13, 19, 20, and 22 (`move-janissarys-acp-tool-loop-13-agent-run-switch.md`, `move-janissarys-acp-tool-loop-19-far-side-run-wiring.md`, `move-janissarys-acp-tool-loop-20-far-side-cancellation.md`, `move-janissarys-acp-tool-loop-22-remote-session-tool-requests.md`). Subplan 24 adds host tags, and subplan 25 deletes the frames this subplan stops using.

This is the switch the series has been building toward. A remote tab's `ask`, `tell`, or plugin `promptAcp`, and an `agent … on <host>` run, now send `acp-run` and let the far side run the loop. Workspace tools then resolve against the remote clone. Caller tools still run here, through the far side's tool requests.

## Design decisions

- **One entry point, two session kinds** (source decision 1). `runToolLoop` in `src/acp/drive-loop.ts` checks the `remote: true` discriminant on the unwrapped session:
  - a `RemoteAcpSession` gets `session.run(prompt, snapshot, host.runCaller, events)`;
  - a local `AcpSession` is driven in-process through `driveToolLoop`, as before.
  
  `runCorePrompt` and `executeAgentRun` therefore wrap only a local session in their `active()` provider guard. A remote session's events are already guarded by `guardAcpHandlers`.
- **Session type split.** `RemoteAcpSession` becomes `Omit<AcpSession, 'prompt'>` plus `run`, `ready`, `release`, and `remote: true`. No new lifecycle type is needed.
  - The adapter's `prompt` implementation is deleted. Nothing sends `acp-prompt` after this subplan.
  - The holder in `src/acp/session-manager.ts` stores `AcpSession | RemoteAcpSession`. `session`, `currentSession`, and `isCurrent` take and return the union.
  - Every other use of `holder.session` there and in `src/acp/manager.ts` calls only `cancel`, `kill`, or `shutdown`. The one exception is the hand-off to `runCorePrompt`, which accepts the union.
- **Caller tools round-trip** (source decision 3). For both a remote tab and a remote run, `runCaller` is the same local runner as before: `dispatchNative` for a tab, `runGrantedAgentCommand` with the question status for a run. So `db` writes to the local `.janissary/db/sqlite/` and shows in the local connections panel, `browser` drives the local browser, and `question` opens the local panel. Its answer travels back as the tool result.
- **Remote agent runs.** `executeAgentRun` passes its `RemoteAcpSession` to `runToolLoop`, so the far side runs `janissary file read …` in the run's execution directory. The interim `Remote connection unavailable.` workspace branch from subplan 13 is deleted.
- **Transport loss** (source decision 10). The prompt settles with the existing `Remote connection lost.` error through the session's `onTransportLost` hook and the run's released control (subplan 21). The holder is dropped, so the next `ask` or `tell` starts a fresh session. The far side has already aborted the loop (subplan 20).

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Entry point | `runToolLoop` in `src/acp/drive-loop.ts` (subplan 10) |
| Remote run method and discriminant | `RemoteAcpSession.run`, `remote: true` (subplans 21 and 22) |
| Holder and lifecycle calls | `CoreSession`, `session`, `currentSession`, `isCurrent` in `src/acp/session-manager.ts`; `AcpManager` in `src/acp/manager.ts` (200 effective lines, so it must not grow; the union flows through `acquire`'s inferred return type) |
| Core and agent call sites | `runCorePrompt` in `src/acp/run-prompt.ts`; `executeAgentRun` in `src/agent/execute.ts` |

## Proposed changes

- `src/acp/drive-loop.ts`: the remote branch of `runToolLoop`.
- `src/remote/acp-session.ts`: the type split and the deleted `prompt`.
- `src/acp/session-manager.ts`: the union holder types.
- `src/acp/run-prompt.ts`: accept the union, and wrap only a local session.
- `src/agent/execute.ts`: wrap only a local session, and delete the interim workspace branch.

## Tests

- `src/acp/run-prompt.test.ts`, on a remote tab with a fake `RemoteAcpSession`:
  - the prompt sends `acp-run` with the role's snapshot;
  - a `db` tool request runs locally and its result is sent back;
  - a disabled refusal step raises `command-disabled`;
  - `acp-run-end capped` gives the `(stopped after 8 tool steps)` paragraph.
- `src/agent/execute.test.ts`: a remote run sends `acp-run` with the agent snapshot rather than driving the loop locally, and runs a granted `janissary db …` request through `runGrantedAgentCommand`.
- Existing tests move to the new frames:
  - `src/acp/manager.test.ts`: the `{ type: 'acp-prompt', … }` expectations become `acp-run` with the role's snapshot;
  - `src/acp/index.test.ts`: the fake far side routes `acp-run` and `acp-tool-result` to the real `RemoteAcp`;
  - `src/remote/acp-session.test.ts`: the `prompt` cases become `run` cases.

## Out of scope

Host tags (subplan 24). Deleting `acp-prompt` and `acp-end` and the version bump (subplan 25). Running `db`, `browser`, or `question` on the remote host, or showing a remote host's databases or browsers locally. Monitors, conversations, and editor persona ACP consumers, which do not enter the tool loop and keep using local `connectAcp` sessions.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then, on a remote shell tab, run steps 3 to 6 of subplan 27 (the typed read, the local database, the local question, and the reset). The tag step comes with subplan 24.
