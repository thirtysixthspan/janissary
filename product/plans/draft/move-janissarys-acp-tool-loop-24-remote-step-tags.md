# ACP tool loop 24 — `[<host>] ` tags on remote workspace steps

**Complexity: 3/10** — ~20 added lines across 3 edited files, 5 requirements, 6 scenarios (p=4.81)

Run order: 24 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (decision 8; the tagging and `RemoteAgentTarget` sentences of "Local side"). Depends on subplan 23 (`move-janissarys-acp-tool-loop-23-remote-loop-switch.md`), after which workspace steps on remote tabs and runs come from the far side.

When a tool step ran on a remote host, the transcript and the connection record should say so, so a reader never mistakes a remote read for a local one. This subplan tags those steps with the host name and leaves every other step as it was.

## Design decisions

- **What is tagged** (source decision 8). A tool step that executed on a remote host is shown with the prefix `[<host>] `. That is a workspace step (`workspace: true`) on a remote tab or a remote agent run.
- **Core.** On a tab with `tab.remote` set, `<host>` is `tab.remote.host` (`RemoteTarget.host`). The prefix goes on:
  - the command in the `acp: true` transcript entry's input;
  - the command line `startCommand` writes to the connection record;
  - the result line `ranCommand` writes to the connection record.
- **Agent run.** `<host>` is the run's execution host, and the prefix goes on both of the run's `run.record?.activity('tool', …)` lines.
  - `RemoteAgentTarget` in `src/agent/execute.ts` gains `host`.
  - `executeAgentRunSafely` in `src/agent/launch.ts` fills it from `remoteTarget.host` (`RemoteAgentTarget.host` in `src/agent/remote-target.ts`).
- **Untagged.** Caller-side steps and refusals carry `workspace: false` and are never tagged. Every step on a local tab or a local run is untagged, and so is typed `file read` output (source plan "Out of scope").

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Core step handlers | `startCommand`, `ranCommand` in `runCorePrompt`, `src/acp/run-prompt.ts` (subplan 11) |
| Agent step handlers and remote target | `executeAgentRun`, `RemoteAgentTarget` in `src/agent/execute.ts`; `executeAgentRunSafely` in `src/agent/launch.ts` |
| A tab's remote host | `tab.remote.host` |

## Proposed changes

- `src/acp/run-prompt.ts`: prefix a remote workspace step's command and result as above.
- `src/agent/execute.ts`: `host` on `RemoteAgentTarget`, and the same prefix on a remote run's workspace step.
- `src/agent/launch.ts`: pass `remoteTarget.host`.

## Tests

- `src/acp/run-prompt.test.ts`, on a remote tab:
  - a far-side `file read` step is tagged `[<host>] ` on the transcript entry input and on both record activity lines;
  - a `db` caller step and a refusal step are untagged;
  - on a local tab, a `file read` step is untagged.
- `src/agent/execute.test.ts`:
  - a remote run's far-side `file read` step is tagged with the execution host on both activity lines;
  - its `db` step is untagged;
  - a local run's `file read` step is untagged.

## Out of scope

Tagging typed `file read` output or caller-side steps. Any wire change.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then, on a remote shell tab, run step 2 of subplan 27: `tell read notes/remote-only.md and summarize it` shows a `[<host>] file read notes/remote-only.md` step.
