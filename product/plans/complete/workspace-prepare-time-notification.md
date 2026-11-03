# Report how long a workspace took to prepare

**Complexity: 3/10** — one timing measurement in `WorkspaceManager`, one new explicit notification event, and a message formatter. The notification pipeline and the manager's existing post-ready callback already carry everything needed.

## Goal

When a workspace clone (from `shell --workspace`, `harness <name> --workspace`, or an agent run) finishes provisioning — the clone plus its follow-up git setup — an informational notification reports how long it took: `Prepared workspace $workspace/<name> in 4.2s.` It is attributed to the tab that owns the workspace.

## Approach

1. **Measure.** `WorkspaceManager.create` records `performance.now()` just before starting `provisionWorkspace`. `trackReady` computes the elapsed time once `handle.ready` resolves.
2. **Report.** `WorkspaceManager` takes a third optional constructor callback, `onReady(label, dir, elapsedMs)`, called after a successful provision under the same guard as the credential-failure notice: only when this attempt is still the pending one for its name and the directory is still tracked. A failed or cancelled clone, or one released before it finished, reports nothing. A throwing callback never rejects readiness.
3. **Message.** A pure `workspaceReadyMessage(dir, elapsedMs)` in `src/workspace/ready-notice.ts` renders `Prepared workspace $workspace/<name> in <duration>.` using `abbreviateWorkspaceDir`. The duration reads `0.8s`/`12.3s` under a minute (one decimal) and `1m 05s` from a minute on.
4. **Event.** Add the explicit `workspace-ready` event: type union, `EXPLICIT_EVENTS` entry, rendered as-is by `notificationText`, and alert defaults `{ desktop: true, sound: 'success' }` — the informational cue, and the project's rule that every explicit event alerts by default (pinned by `src/notifications/native.test.ts`). `createManagers` wires `onReady` to `notify(managers, 'workspace-ready', label, workspaceReadyMessage(dir, elapsedMs))`.

## Implementation steps

1. Add `src/workspace/ready-notice.ts` with `formatPrepareDuration` and `workspaceReadyMessage`.
2. Add the `onReady` callback and timing to `WorkspaceManager`.
3. Add the `workspace-ready` notification event and wire it in `createManagers`.
4. Update `product/specs/notifications.md` and the workspace spec.

## Tests

- `src/workspace/ready-notice.test.ts`: sub-second, sub-minute, and over-a-minute durations; the message names `$workspace/<name>`.
- `src/workspace/manager.test.ts`:
  - reports the elapsed time between `create` and readiness to `onReady` with the label and directory.
  - does not report when the clone fails.
  - does not report a workspace released before it finished.
  - a throwing `onReady` does not reject readiness.
- `src/notifications/format.test.ts`: `workspace-ready` renders its detail as-is.

## Out of scope

- Remote-host workspace clones, whose manager on the remote side has no notification wiring.
- Breaking the time down into clone versus setup phases.
- A config toggle for the event.
