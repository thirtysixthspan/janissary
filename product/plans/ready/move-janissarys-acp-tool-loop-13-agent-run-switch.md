# ACP tool loop 13 — agent runs on the shared driver

**Complexity: 5/10** — ~35 added production lines in 1 edited file, 9 requirements and 14 scenarios (p=5.27)

Run order: 13 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (the `executeAgentRun` sentences of "Per-prompt snapshot" and "Local side"; decisions 1, 7, 13, and 22, local agent halves). Depends on subplans 3, 11, and 12 (`move-janissarys-acp-tool-loop-3-file-read-reader.md`, `move-janissarys-acp-tool-loop-11-core-loop-driver-switch.md`, `move-janissarys-acp-tool-loop-12-agent-driver-kind.md`). Subplan 23 hands a remote run's loop to the far side.

`executeAgentRun` still drives its own copy of the tool loop. This subplan switches it to `runToolLoop` with an `agent` snapshot, so local and agent runs share one code path. It also makes a granted `janissary file read …` read the run's own execution directory.

## Design decisions

- **Snapshot.** `executeAgentRun` builds the two-field `agent` snapshot inline: `grants` from `run.snapshot.grants`, and `askUser` true when a selected skill is named `ask-user`. It needs no module of its own.
  - Include the `kind: 'agent'` discriminant required by `AcpRunSnapshot` at `src/acp/types.ts:124`. Keep the existing guarded session adapter at `src/agent/execute.ts:129` (`session.prompt`); it continues dropping provider callbacks after termination.
- **Host.**
  - `runCaller` is today's runner. It throws `Agent terminated.` once the run has an outcome or is aborted, sets the status to `Waiting for answer` around a `question` command and back to `Running` afterwards, and calls `runGrantedAgentCommand`, whose grant check is unchanged.
  - `runWorkspace` is `readWorkspaceCommand(run.executionDir, command)` from subplan 3, so the root is the run's execution directory on its execution host (source decision 13).
  - Both host methods check the same active-run condition before executing. Normalize the workspace command with the existing granted runner's trim and optional leading-slash removal before passing it to `readWorkspaceCommand`; the agent gate already recognizes that form, while the file parser expects `file` as its first token.
  - **Remote runs until subplan 23.** A remote run's session is still driven in-process here, and its `executionDir` names a directory on the remote host. So for a remote run `runWorkspace` answers `Remote connection unavailable.` instead of reading the local disk at that path. Subplan 23 deletes this branch when the far side takes the loop over.
- **Events.**
  - `startCommand` records `run.record?.activity('tool', command)`.
  - `ranCommand` records the result the same way while the run has no outcome and is not aborted. The two activity lines are what the connection record showed before.
  - `endTurn` keeps the final answer, and `finished` and `error` settle as today.
- **Unchanged.** Readiness, the sandbox notice, resource cleanup, the termination answer, and the empty-response failure.
- **Size.** `execute.ts` is 174 raw lines before this switch and remains below 200 effective lines with the small inline snapshot and host. Keep construction inline; if implementation reveals a necessary extraction, update and re-improve this plan before adding a module.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Today's agent loop | `executeAgentRun` in `src/agent/execute.ts` |
| Granted runner | `runGrantedAgentCommand` in `src/agent/command-tools.ts` |
| Entry point and agent kind | `runToolLoop` in `src/acp/drive-loop.ts` (subplans 10 and 12) |
| Workspace runner | `readWorkspaceCommand` in `src/file-read/read.ts` (subplan 3) |

## Proposed changes

`src/agent/execute.ts`: build the snapshot and call `runToolLoop` with the guarded session, prompt, snapshot, host, guarded events, and abort signal, in that order. Replace the direct `runAcpToolLoop` import with `runToolLoop`, remove the now-unused Markdown instruction and extractor imports, and import the workspace reader directly from `src/file-read/read.ts`. Move tool recording from the old runner into `startCommand` and `ranCommand`, so workspace reads and gate refusals also produce one command/result pair. Preserve the existing final-answer, error, readiness, and cleanup handlers.

`product/specs/agent-command.md`: in local task execution, state that a `file` grant permits numbered `file read` results from the execution workspace and that the caller's directory is not the read root. Do not claim the remote loop handoff is delivered here; subplan 23 owns it.

## Tests

`src/agent/execute.test.ts`:
- a local run's `janissary file read notes/a.md` returns numbered lines from the execution directory;
- an ungranted read returns `Agent: command not permitted: file read notes/a.md.`;
- a granted `db` command still dispatches;
- each step records two `tool` activity lines;
- a question sets `Waiting for answer` and then `Running`;
- a remote run's workspace step answers `Remote connection unavailable.`.
- a slash-prefixed file command follows the same workspace route and reads successfully;
- callbacks and host work after termination produce no new tool record or file read; existing readiness, empty-answer, connection-failure, and cleanup cases remain intact.

Keep the real shared driver in these execution tests. The existing low-level `runAcpToolLoop` mock can remain, but its record-capture test at `src/agent/execute.test.ts:63` must simulate the loop's `ranCommand` callback after awaiting the captured runner, because result recording now belongs to that event rather than the host. Exercise refused reads through the captured runner too, proving the gate is reached. Use a temporary execution directory containing the file fixture and a distinct caller directory. Keep the existing granted-command spy and assert its db dispatch arguments; do not replace grant behavior with a host stub that skips the driver.

## Out of scope

Running a remote run's loop on the far side, and tagging its steps (subplans 23 and 24). Any wire change.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then, by hand, run a local `agent` task whose skill grants `file`, asking it to read a file in its workspace. The monitor's activity shows the `file read` step and its numbered result, and the run completes.
