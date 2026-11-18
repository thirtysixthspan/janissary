# Record native command start activity as a subagent command begins

**Complexity: 2/10** — two production lines in one file, three behavioral requirements and four scenarios (p=3.69); the guard and remote tagging stay untouched and no new units are needed.

## Goal

When a subagent attempt runs a native command through the loop, write the command text to the attempt's durable record feed the moment the command starts instead of only after it finishes. Keep the command result as a separate later tool entry, and keep the command text recorded even when the command fails or is aborted before it returns.

## Approach

`runSubagentEntry` (`src/subagent/attempt.ts`) builds its `AcpLoopHandlers` inside `guardAcpHandlers` and passes them to `runToolLoop`. Today `startCommand` is a no-op and `ranCommand` writes both the command text and the result through `state.toolActivity`, so the feed sees the command only after the command has returned. `state.toolActivity` already owns the `chosen` guard and the remote-host tagging; it must stay exactly as it is.

`executeAgentRun` (`src/agent/execute.ts`) already uses the target split: `startCommand` records the command through `run.record?.activity('tool', tagged(command, workspace))`, and `ranCommand` records only the result through `run.record?.activity('tool', tagged(result, workspace))`. Mirror that split in the subagent attempt using `state.toolActivity`: the start handler records the command, the result handler records only the result.

The loop driver calls `startCommand` synchronously in `gatedRunner` (`src/acp/drive-loop.ts`) before it invokes the host's command runner, so the activity is written before the command can resolve, fail, or be aborted. A late failure then calls `state.fail`, which closes the state; the earlier start activity stays in the feed.

## Implementation steps

1. In `src/subagent/attempt.ts`, change the handlers passed to `runToolLoop` so `startCommand: (command, workspace) => { state.toolActivity(command, workspace); }` and `ranCommand: (_command, result, workspace) => { state.toolActivity(result, workspace); }`. Leave `createAttemptState`'s `toolActivity` guard and remote-host tagging untouched.
2. Run `$janissary/scripts/run.mjs check-diff` and fix any failures before continuing.

## Tests

1. In `src/subagent/attempt.test.ts`, add a real-loop test that drives a workspace command from a scripted session and holds the command runner's promise pending. Assert the command text is already in `record.activity` while no result entry exists yet; release the promise and assert the result is recorded as a separate, later entry.
2. Add a real-loop test where the command runner rejects. Assert the command text is still in `record.activity` even though no result is recorded and the attempt fails.
3. Keep the existing tool-output test's assertions intact by issuing the matching `startCommand` event before `ranCommand`, and keep the capped-result test passing unchanged.

## Out of scope

- Changing `createAttemptState`'s `toolActivity` guard, remote-host tagging, or any result/status selection logic.
- Changing `src/agent/execute.ts` or the shared loop driver; they already have the behavior being mirrored.
- Changing the PR title or description; the resolved entry calls for no description correction.
- New help pages or user documentation: the internal activity feed has no such coverage.
