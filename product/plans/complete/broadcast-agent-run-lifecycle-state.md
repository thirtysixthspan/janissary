# Broadcast Agent Run Lifecycle State

**Complexity: 5/10** — one lifecycle broadcast at start, one at finish, and one after the task path resolves touch the shared agent manager and launch path, so the change must neither flood clients from activity updates nor miss either edge of a live run.

## Goal

Make a caller's connections popup show its running agent as soon as the run is created, refresh that row's title once the task path resolves, and drop the row as soon as the run finishes — including a run retained for a monitor tab.

## Approach

Broadcast the existing `state: dirty` signal at the two lifecycle edges instead of wiring it into every run update:

- `AgentRunManager.create` broadcasts after the run and its durable record are published into `runs`, because `ConnectionManager.activeAgentRows` reads that map and the record id. This makes the caller's popup include `Agent: <task>` immediately, including headless runs.
- `AgentRunManager.finish` broadcasts once per run when the call actually starts the finish, immediately after `run.finish` sets the outcome. Row visibility depends on `run.outcome`, not on map removal, so this also covers a run retained because a monitor is attached; an already-finishing second call does not emit again.
- `launchAgent` broadcasts after `run.setSnapshot(snapshot)` because the placeholder snapshot carries the launch selector while the resolved snapshot carries the task filename the popup row displays. A remote resolution that names a different file, for example, changes the row from the selector's title to the resolved file's name.

`AgentRun.publish` stays untouched: it fires on every activity and status update, and broadcasting full application state from it would be the flood the proposal warns against. `ConnectionManager.activeAgentRows` already owns the projection and its tests stay as they are.

## Implementation steps

1. In `src/agent/manager.ts`, emit `messageBus.emit('state', { type: 'dirty' })` from `create` after `this.runs.set(run.id, run)` and the known-run registration, and from `finish` once per run when it begins the finish.
2. In `src/agent/launch.ts`, emit the same signal after `run.setSnapshot(snapshot)`.
3. Add the lifecycle test in `src/agent/manager.test.ts` and the real launch test in `src/commands/agent.test.ts`.
4. Update the agent-run popup behavior in `product/specs/agent-command.md` and `product/specs/connections-tab.md`.

## Tests

- `src/agent/manager.test.ts`: subscribing to `state: dirty`, creating a run broadcasts once and that broadcast's caller projection contains `Agent: task.md` with the run's record id; finishing broadcasts again and the projection has no agent row. A monitored run that finishes broadcasts the row gone even though the run stays in the map for its monitor.
- `src/commands/agent.test.ts`: a headless remote run broadcasts a row under the launch selector, then a broadcast sees the resolved `Agent: other.md` title before execution starts; the row is present during execution and gone after the finish broadcast.
- Existing `src/plugins/host-state.test.ts`, `src/tab/view.test.ts`, and `src/connection/manager.test.ts` remain green; they read the projection rather than the trigger.

## Out of scope

- Broadcasting on run activity, status, revision, or monitor view updates.
- Changing `ConnectionManager.activeAgentRows`, record-tab opening, popup rendering, or web client state handling.
- Adding user documentation where no existing page describes the running-run row.
