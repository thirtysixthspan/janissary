# ACP tool loop 24 — `[<host>] ` tags on remote workspace steps

**Complexity: 4/10** — ~18 added lines across 3 production files, 7 requirements, 8 scenarios, 2 inline helpers (p=5.12)

Run order: 24 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (decision 8; the tagging and `RemoteAgentTarget` sentences of "Local side"). Depends on subplan 23 (`move-janissarys-acp-tool-loop-23-remote-loop-switch.md`), after which workspace steps on remote tabs and runs come from the far side.

When a tool step ran on a remote host, the transcript and the connection record should say so, so a reader never mistakes a remote read for a local one. This subplan tags those steps with the host name and leaves every other step as it was.

## Design decisions

- **What is tagged** (source decision 8). A tool step that executed on a remote host is shown with the prefix `[<host>] ` — a literal `[`, the host, `]`, and one space. That is a workspace step (`workspace: true`) on a remote tab or a remote agent run. The tag is display text only: it changes neither the command a tool receives, the result returned to the model, nor any notification message.
- **Core.** On a tab whose session is remote, `<host>` is `tab.remote.host` (`RemoteTarget.host`, `src/tab/types.ts:111`). `runCorePrompt` receives the tab runtime rather than the tab (`src/acp/run-prompt.ts:71`), so read the host from `managers.tab.byLabel(label)?.remote?.host` once, under the same `'remote' in session` check the function already makes at `src/acp/run-prompt.ts:93`. The prefix goes on:
  - the command in the `acp: true` transcript entry's input;
  - the command line `startCommand` writes to the connection record (its `recordTool(command)` at `src/acp/run-prompt.ts:105`);
  - the result line `ranCommand` writes to the connection record (its `recordTool(result)` at `src/acp/run-prompt.ts:108`).
- **Gate on the step, not the tab.** Tag only when the session is a `RemoteAcpSession` (`'remote' in session`) and the step reports `workspace: true`. Do not tag from `tab.remote` alone: `AcpSessionManager` falls back to a local `connectAcp` session when a remote tab has no channel (`src/acp/session-manager.ts:76-88`), and that fallback's workspace step is not a far-side step (with no channel, `readFileInTab` answers `Remote connection unavailable.` at `src/file-read/tab-read.ts:31-35`).
- **The far-side flag already travels.** `startRemoteLoop` emits `acp-tool-step` with `workspace: workspace ?? false` (`src/remote/serve-acp-loop.ts:54-65`), and `createRemoteAcpRun.step` passes it to both local handlers (`src/remote/acp-session-run.ts:87-92`). `startCommand` at `src/acp/run-prompt.ts:105` currently discards that second argument; it must accept and use it.
- **Agent run.** `<host>` is the run's execution host, and the prefix goes on both `run.record?.activity('tool', …)` lines (`src/agent/execute.ts:162-163`). Those handlers also discard the `workspace` argument today; tag only when `remote !== undefined` and `workspace === true`.
  - `RemoteAgentTarget` in `src/agent/execute.ts:30` is a narrowed parameter type (`{ channel; offline? }`); add `host: string`. The launch-side target in `src/agent/remote-target.ts:9-14` already carries `host`.
  - `executeAgentRunSafely` in `src/agent/launch.ts:68-82` fills it from `remoteTarget.host` in the call at `:77-78`.
  - The run already records the same value as `executionHost` (`src/agent/launch.ts:118`); the handlers read the target's `host` directly, not `run.view().host`, which is display metadata (`src/agent/run.ts:60-63`).
- **Untagged.** Caller-side steps and refusals carry `workspace: false` and are never tagged; leave the `command-disabled` notification and the transcript entry's `output` raw. Every step on a local tab or a local run is untagged, including a remote tab whose session fell back to local, and so is typed `file read` output (source plan "Out of scope").

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Far-side step flag | `startRemoteLoop` sends `acp-tool-step` with `workspace` (`src/remote/serve-acp-loop.ts:54-65`); `createRemoteAcpRun.step` calls `startCommand` and `ranCommand` with it (`src/remote/acp-session-run.ts:87-92`) |
| Core step handlers | `startCommand` and `ranCommand` in `runCorePrompt` (`src/acp/run-prompt.ts:105-110`), wrapped by `guardAcpHandlers` (`src/acp/guard-handlers.ts:9-10`) |
| Agent step handlers and remote target | `startCommand` and `ranCommand` at `src/agent/execute.ts:162-163`; execute-side `RemoteAgentTarget` at `:30`; full launch-side target at `src/agent/remote-target.ts:9` |
| A tab's remote host | `tab.remote.host` (`RemoteTarget`, `src/tab/types.ts:111-114`); already copied into the connection record's source at `src/acp/session-manager.ts:49-52` |
| A run's execution host | `executionHost` on the run, set from `remoteTarget.host` at `src/agent/launch.ts:118` |
| Existing tests to extend | `run-prompt.test.ts` remote-session harness and `remoteCall` (`src/acp/run-prompt.test.ts:61-122`); `execute.test.ts` `start(remote)` and frame listener (`src/agent/execute.test.ts:142-253`) |

## Proposed changes

- `src/acp/run-prompt.ts`: read the host once as above; make `startCommand` accept `workspace`; prefix the transcript input and both record lines when the session is remote and the step is a workspace step. Inline the prefix expression; do not add a shared module for it.
- `src/agent/execute.ts`: add `host` to the execute-side `RemoteAgentTarget`, read `workspace` in both handlers, and prefix both activity lines when `remote` is set and the step is a workspace step.
- `src/agent/launch.ts`: pass `host: remoteTarget.host` through `executeAgentRunSafely`.
- No other production file changes. The far side, `src/remote/acp-session-run.ts`, `src/remote/serve-acp-loop.ts`, `src/acp/record-feed.ts`, and the wire protocol stay as they are; the tag is added only on the local display side.
- `src/commands/agent.test.ts`: its remote launch fixture asserts the exact `RemoteAgentTarget` shape produced by `src/agent/launch.ts`, which now includes `host`, so its expected target must carry `host: 'devbox'`. That fixture is the only change in this file.
- File sizes after the edits stay well under the 200-line `max-lines` limit: `run-prompt.ts` 129, `execute.ts` 177, and `launch.ts` 174 before the change, so no extraction is needed.

## Tests

- `src/acp/run-prompt.test.ts`, using the remote-session option and `remoteCall` already in the harness (`:61-122`):
  - a remote tab whose `tab.remote.host` is `far`, using the remote-session option, with a record id: a far-side `file read` step tags `[far] ` on the transcript entry input, the `startCommand` activity line, and the `ranCommand` activity line; the transcript entry's output stays raw;
  - a `db` caller step (`workspace: false`) and a `refused: 'disabled'` step are untagged on the transcript and both record lines; the existing refusal-notification case at `:420` stays as it is;
  - on a local tab (no `tab.remote`, local session), a `file read` step with `workspace: true` is untagged;
  - on a remote tab whose session is the local `connectAcp` fallback (`tab.remote` set, `remoteSession: false`), a `file read` step with `workspace: true` is untagged.
- `src/agent/execute.test.ts`:
  - remote runs now need a host in their target: add `host: 'build-box'` to the remote-target arguments at `:72`, `:176`, `:339`, `:507`, and `:519` (the last two pass `{ channel: silentChannel() }`);
  - update the existing "sends the agent snapshot to the far side and renders its workspace step" case (`:229-253`) to expect `[build-box] file read notes/a.md` and `[build-box] 1\tworkspace` on the two activity lines at `:246`;
  - a remote run's far-side `file read` step is tagged with the execution host on both activity lines;
  - its `db` step (`onToolRequest`, `workspace: false`) is untagged;
  - a local run's `file read` step is untagged.
- `src/commands/agent.test.ts`: the agent-command case that asserts the exact remote target passed to `execute` (`:724`) expects `{ channel, host: 'devbox', offline: undefined }`, because its fixture asserts the `RemoteAgentTarget` shape produced by `src/agent/launch.ts`, which now includes `host`.
- No far-side or wire tests change: `src/remote/serve-acp-loop.test.ts` and `src/remote/serve-acp.test.ts` keep asserting raw `acp-tool-step` text, because the prefix is added after the frame is received.

## Out of scope

Tagging typed `file read` output, caller-side steps, refusals, notifications, or the transcript entry's output. Any wire change: the far side keeps sending the raw command and result, and the local side adds the prefix. Spec and documentation updates, owned by subplan 26 (`move-janissarys-acp-tool-loop-26-specs-and-docs.md`).

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then, on a remote shell tab, run steps 2, 3, 4, 8, and 9 of subplan 27 (`move-janissarys-acp-tool-loop-27-end-to-end-verification.md`): step 2 shows a `[<host>] file read notes/remote-only.md` core step with both record lines tagged; step 8 shows the same on a remote agent run; step 3 shows typed output untagged; step 4 shows a caller-side `db` step untagged; step 9 shows a refusal untagged.
