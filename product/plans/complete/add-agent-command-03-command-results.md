# Add structured command results and invocation attribution

**Complexity: 6/10** — A typed result crosses core dispatch, plugin adapters, and legacy transcript capture; invocation-scoped attribution must preserve the existing plugin deadline and void-command behavior.

## Goal

Allow a command to return an optional structured result and carry explicit server-created invocation ownership through dispatch without changing existing void-command behavior.

## Decisions and dependencies

Depends on the completed `product/plans/complete/add-agent-command-02-run-ownership.md` for stable run IDs, captured caller identity/context, and abort signals. Implement before the agent launch and command-tool steps depend on returned results. Preserve the existing command registry as the sole command definition and execution path. Legacy shell output remains available, but captured output must be attributable to the invocation that produced it rather than unrelated caller-tab traffic. Keep the run and invocation identifiers server-only; plugin code receives only its existing scoped origin and capabilities.

## Existing code to reuse

| Existing mechanism | Verified reference | Reuse and required change |
| --- | --- | --- |
| Canonical command contract and execution | `src/commands/types.ts:5` (`Command`); `src/command/manager.ts:82` (`executeCommand`); `src/commands/index.ts:91` (`findCommand`) | Add the optional invocation context and structured return to this one registry path; keep existing `void` commands valid. |
| Shell/plugin dispatch result | `src/command/manager.ts:57` (`dispatchLineWithOutput`); `src/plugins/api.ts:372` (`dispatchLineWithOutput`) | Preserve `dispatched`, `output`, and `coreResponse`; add an optional structured-result field without changing existing plugin callers. |
| Legacy transcript capture | `src/capture/execute-and-capture.ts:11` (`executeAndCapture`) | Retain this shared capture path for commands without a structured result, but correlate appended output with the invocation rather than only the tab label. |
| Plugin command adapter and host guard | `src/plugins/command-adapter.ts:61` (`createPluginCommands`); `src/plugins/host.ts:80` (`runCommand`); `src/plugins/line-capabilities.ts:85` (`dispatchLineWithOutput`) | Carry trusted context internally across the adapter. Keep the existing capability boundary and host-wait deadline exemption; do not expose invocation ownership to plugin code. |
| Dispatch capability consumers and local reply types | `src/plugins/shell/activate.ts:173` (`dispatchLineWithOutput`); `src/plugins/launcher/activate.ts:170` (`dispatchLineWithOutput`); `src/plugins/launcher/shared.ts:113` (`LauncherDispatchReply`); `src/plugins/shell/shared.ts:91` (`ShellDispatchResult`); `src/plugins/diff/tab-state.ts:167` (`dispatchLineWithOutput`) | Check all existing consumers and result aliases when extending the optional reply field. Preserve their current output rendering and fire-and-forget behavior for commands that have no structured result. |

## Proposed changes

Extend `Command.run` with an optional server-created invocation context and optional structured result while retaining existing commands that return `void`. The context carries run ID, invocation ID, captured caller context, and abort signal. `CommandManager` creates or accepts this context only from a trusted server call; ordinary dispatchers cannot provide or overwrite its ownership fields. Pass it through resolution, command execution, and plugin command adapters, but expose plugins only their existing scoped origin and capabilities.

Preserve shell dispatch's existing `dispatched`, `output`, and `coreResponse` fields and add an optional structured result. The `coreResponse` branch keeps its existing no-capture behavior while returning a structured result when present. Define the structured result as the command's typed return value; for `agent`, use `status`, `response`, and `cleanupWarnings` from `product/plans/ready/add-a-new-agent-command.md:36` ("Return an optional structured command result"). Return it directly from nested dispatch without waiting for or inferring it from transcript appends. When a command returns a structured result, bypass the legacy 30-second printed-output capture. For void-returning commands, retain printed-output capture, but tag transcript append events with the server-owned invocation identity and propagate that identity through command-originated append paths; capture only matching events so overlapping commands on one caller tab cannot capture one another's output. Do this with explicit context propagation, not ambient state. Shell display and plugin output remain exactly once: a structured response is not also appended by the capture layer. Keep the plugin host-wait deadline exemption intact, including for results that take longer than 30 seconds.

Make the changes in this order: define the internal result/context contract; thread it through `Command.run`, `executeCommand`, and registry dispatch; add append-event attribution and thread it through command-originated append paths; adapt `dispatchLineWithOutput` and `executeAndCapture`; then thread context through plugin command adapters while keeping plugin API ownership narrow. Do not change plugin ordering or introduce another command execution path.

## Tests

Extend `src/command/manager.test.ts` for structured-result return, void compatibility, dispatch field compatibility, nested result delivery, and a command exceeding the 30-second default without early capture settlement. Extend `src/capture/execute-and-capture.test.ts` for invocation-specific filtering when two commands append to one tab concurrently, late appends after capture completion, and cleanup of the subscription. Extend `src/plugins/shell-capabilities.test.ts` and `src/plugins/dispatch-deadline.test.ts` to verify output/result forwarding and that the host-wait remains exempt while the plugin's own work remains timed. Cover core plugin-command adapter forwarding in `src/plugins/host.test.ts` or `src/command/manager.test.ts`, and preserve existing ACP-dispatched command behavior in `src/acp/plugin-session.test.ts`. Assert callers cannot supply or replace server ownership context and plugins cannot read run IDs. Keep test files colocated with their source modules under `src/**/*.test.ts`.

## Verification

Branch tests cover structured-result delivery, the legacy capture deadline, invocation-specific output filtering, plugin result forwarding, and host-wait deadline behavior. This coverage preserves void-command capture and result delivery without mixing unrelated same-tab output.

## Out of scope

Do not implement the `agent` command, question awaiting, command grant execution, ACP integration, remote propagation, or tab allocation ownership. Do not alter output behavior for unrelated commands.
