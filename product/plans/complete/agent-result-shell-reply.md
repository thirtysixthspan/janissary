# Show agent results in the shell reply

**Complexity: 3/10** — One dispatch branch in the command manager changes, with its tests and one spec sentence. The entry this plan resolves was rated 8/10 for severity; the rating gate was overridden by the user's instruction for this entry.

## Goal

When a shell-tab command-bar line runs `agent`, the run's `Status:` line and response appear beneath that line, as `product/specs/agent-command.md` requires. Today the reply is written to the tab's entry but dropped by the dispatcher, so the shell tab shows only the echoed input.

## Decisions and dependencies

The structured branch of the command dispatcher returns the output the command appended under its invocation together with the structured result. The shell client already renders a dispatched line's `output` beneath the line, so the client needs no change.

The structured branch stops applying the legacy 30-second capture window. The branch already awaits the whole execution before returning, so the window adds no waiting; it only cut off output appended after 30 seconds, which for a long agent run is the final status line. The existing test asserting that a structured result does not settle at the deadline still holds.

The transcript entry and the dispatched reply are separate surfaces. The shell tab renders the reply and not the transcript entry, so the status is displayed once there. The `coreResponse` path, used by `acp`, is unchanged.

## Existing code to reuse

| Existing mechanism | Verified reference | Reuse and required change |
| --- | --- | --- |
| Structured dispatch | `src/command/manager.ts` (`dispatchLine`, structured branch) | Return the captured output with the result; drop the capture limit for this branch. |
| Invocation-scoped capture | `src/capture/execute-and-capture.ts` (`executeAndCapture`) | Reused unchanged; a missing limit means capture runs to completion. |
| Caller reply append | `src/command/append.ts` (`appendCommandOutput`) | Reused unchanged; `src/commands/agent.ts` already appends the formatted reply under the caller invocation. |
| Shell reply display | `web/src/plugins/shell/useShellSubmit.ts` (`displayReply` on a dispatched line) | Reused unchanged; it already shows `output` when `coreResponse` is absent. |

## Proposed changes

1. In `src/command/manager.ts`, the structured branch of `dispatchLine` collects output with no capture limit and returns `{ dispatched: true, output: output.join('\n'), result }`, with `result` present only when the command returned one. The `coreResponse` branch and the output-only branch keep their behavior.
2. `product/specs/application-commands.md`, section "Structured command replies": replace the sentence that a structured result "is not duplicated in captured transcript output" and that capture stops after 30 seconds for commands without a result, so the spec states that a structured command's appended output is returned with its result and that the output-only capture window applies only to commands without one.
3. `product/specs/agent-command.md`, section "Local task execution": add that in a shell tab the status and response appear beneath the command line as the reply.

## Tests

- `src/command/manager.test.ts`: rename the test "returns structured results without also capturing their transcript output" to "returns a structured result with the output it appended". It expects `output: 'displayed once'`, the result, and the transcript entry still holding `displayed once`.
- `src/command/manager.test.ts`: add "keeps output appended after the legacy 30-second deadline". Using fake timers, a structured command appends `late reply` after 30,001 ms, then returns a result. The dispatch reply has `output` containing `late reply` and the result.
- `web/src/plugins/shell/ShellTab.test.tsx`: add "displays an agent run's status reply beneath its line". A dispatched line with output `Status: failed` and `Agent: missing task after execute.` renders both lines in the terminal beneath the typed line.

## Out of scope

- The launcher rail also receives `output` from `dispatchLineWithOutput`. An `agent` row there will now show its status in the rail; this is the rail's intended use and is not changed further.
- Harness and agent tab displays are not changed.
- Remote agent runs and the monitor tab are not changed.
- The 30-second capture window for commands without a result is not changed.
