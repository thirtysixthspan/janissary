# Add the scoped lazy agent monitoring plugin

**Complexity: 8/10** — This repair crosses the agent run owner, plugin host contract, shared projection, authenticated event stream, and lazy client chunk.

## Goal

Allow `agent ... in a tab execute ...` to open a read-only monitor bound to that specific local run. The monitor shows launch metadata, run status, and reported activity, and can terminate only its bound run. Closing or disabling the monitor detaches it without ending execution.

## Approach

Extend the existing tab-plugin contract with a static `agentMonitor` contribution and an import-free plugin payload envelope. Keep run identity and activity owned by `AgentRun`; expose one typed, tab-scoped `agentRun` projection through `TabView` and targeted WebSocket updates. Resolve termination from the server's owning monitor tab, never from a client-supplied run ID. Register literal server and client dynamic loaders so discovery does not activate or bundle the implementation.

Keep the work local-only. Do not add remote execution or protocol behavior, another activity history, a broadcast topic, or an execution surface to the monitor.

## Implementation steps

1. Add run metadata, ordered activity records, status/revision projection, and subscriptions to the run owner. Collect typed ACP session updates without changing ordinary ACP consumers.
2. Add the `agentMonitor` declaration/activation contribution, a scoped termination capability, monitor tab creation and run binding, and failure/close detachment.
3. Add the core wire projection and targeted run-update event, including initial state and stale revision rejection.
4. Add the lazy client entry, read-only monitor body, metadata, activity rendering, and terminate control under `web/src/plugins/agent-monitor/`.
5. Add focused server and client tests for catalog/loader laziness, owning-run projection, ordered revision updates, run isolation, termination, monitor closure, and plugin failure. Update `product/specs/agent-command.md`.

## Tests

The planned server and client coverage includes catalog and loader laziness, owning-run projection, ordered revision updates, run isolation, termination, monitor closure, and plugin failure. The production web build is expected to keep the monitor implementation in a separate client chunk. This plan does not record whether tests or a build inspection were run.

## Out of scope

Remote agent execution or remote protocol changes, general plugin notification topics, a second activity history, direct prompt input, command-bar or terminal capabilities, and changes to unrelated ACP consumers.
