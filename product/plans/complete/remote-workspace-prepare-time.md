# Report how long a remote workspace took to prepare

**Complexity: 3/10** — the remote host already reports readiness on its `workspace-ready` frame. The change adds one optional field to that frame, times the clone on the remote host, and sends the existing `workspace-ready` notification from the local frame handler.

## Goal

When a remote launch's workspace clone finishes provisioning on its host, the local notifications feed reports how long it took, the way a local clone already does: `Prepared workspace $workspace/<name> on <host> in 4.2s.` It is attributed to the remote launch's tab.

## Approach

1. **Measure where the clone runs.** `provisionRemoteWorkspace` (in `src/remote/serve-provision.ts`) records `performance.now()` just before `workspaces.create` and computes the elapsed time once `result.ready` resolves. That covers the clone and its follow-up setup, the same span a local clone is timed over. It leaves out the SSH connection and any root clone offer the user answers before provisioning.
2. **Carry it on the wire.** `workspace-ready` gains an optional `elapsedMs: number` in `src/remote/protocol-frames.ts`. `decodeWorkspaceReady` accepts it only as a finite, non-negative number and treats anything else as a malformed frame. A host running an older janus omits the field, and no time is reported.
3. **Message.** `workspaceReadyMessage(dir, elapsedMs, host?)` adds ` on <host>` after the workspace name when a host is given, matching how `launch-workspace-cleaned` names a remote host.
4. **Notify.** A new `reportRemoteWorkspaceReady(managers, label, host, dir, elapsedMs)` in `src/remote/manager-reports.ts` sends the `workspace-ready` notification when `elapsedMs` is present. The `workspace-ready` case in `src/remote/entry-factory.ts` calls it with the entry's label and the address's host.

## Implementation steps

1. Add the `elapsedMs` field to the frame type and its decoder.
2. Time the clone in `provisionRemoteWorkspace` and send `elapsedMs`.
3. Extend `workspaceReadyMessage` with the optional host.
4. Add `reportRemoteWorkspaceReady` and call it from the entry factory.
5. Update `product/specs/notifications.md`, `product/specs/workspaced-agent.md`, and `product/specs/remote-server.md` where it describes `workspace-ready`.

## Tests

- `src/workspace/ready-notice.test.ts`: the message names the host when one is given.
- Frame decoder tests: `workspace-ready` keeps a valid `elapsedMs`, and rejects a negative, non-finite, or non-number one.
- `src/remote/serve-provision` tests: the `workspace-ready` frame carries the elapsed time between create and readiness.
- `src/remote/manager-reports.test.ts`: `reportRemoteWorkspaceReady` notifies `workspace-ready` with the host in the line, and does nothing without `elapsedMs`.

## Out of scope

- Timing the SSH connection or the root clone offer.
- Reporting a time when a session is reattached (no clone happens).
