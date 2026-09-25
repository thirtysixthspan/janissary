# Report a post-ready remote refusal instead of closing the tab

## Complexity

3/10. One arm of the frame switch in `src/remote/entry-factory.ts` changes, one small report helper joins `src/remote/manager-reports.ts`, and the notifications module gains one explicit event type. No wire change, so `REMOTE_PROTOCOL_VERSION` does not move.

## Goal

`RemoteServer.refuse` in `src/remote/serve.ts` answers every refusal with the provisioning frame `workspace-failed`: an undecodable frame, an unexpected frame type, a request that needs a workspace the server does not have. The `case 'workspace-failed'` arm of `createRemoteEntry` forwards that frame to the owning tab's `onFailed` at any point in the session. The harness launch handler in `src/harness/remote-launch.ts` reads a failure that arrives after its workspace is ready as a reason to close the tab.

So a peer on an older protocol that refuses one frame type it does not know closes a healthy remote harness tab and loses its session. After this change a refusal that arrives once the entry is settled is reported on the tab, and the tab and channel stay open. A refusal before the entry settles still fails the launch exactly as it does today.

## Approach

- In the `workspace-failed` arm, read `entry.settled` before the arm sets it. When the entry is already settled, call a new `reportRemoteRefusal(managers, entry, message)` and stop: no `rejectReady`, no `onFailed`. Otherwise keep today's path unchanged, so the pre-ready consumers of `onFailed` (the launch in `src/harness/remote-launch.ts`, `src/sessions/attach.ts`, `src/sessions/terminate-session.ts`) still get the rejection they wait on.
- `reportRemoteRefusal` lives in `src/remote/manager-reports.ts` beside `notifyBrowserGone` and `reportTruncatedReplay`. It raises a notification on the entry's first remaining label, the same choice `remoteChannelClosed` makes for `remote-session-terminated`, reading `Remote janus on <host> refused a request: <message>`. A notification rather than a transcript line, because the usual remote tab is a harness tab whose body is its PTY, and nothing renders its log.
- The notification is a new explicit event, `remote-refused`, added to `NotificationEventType` and `EXPLICIT_EVENTS` in `src/notifications/index.ts` and to `notificationText` in `src/notifications/format.ts` (the line is carried verbatim). It bypasses focus suppression like every explicit event, because the tab that just had a request refused is very often the tab being watched.

Rejected: reusing `remote-session-terminated` or `remote-session`. The first reports a session ending on its own and the second a user decision in the sessions tab; a refusal is neither, and the session is still alive.

Rejected: a dedicated `refused` frame. One wire frame still means two things after this change, but splitting it needs a protocol bump under `REMOTE_PROTOCOL_VERSION` and is a later change.

## Implementation steps

1. `src/notifications/index.ts`: add `'remote-refused'` to `NotificationEventType`, to `EXPLICIT_EVENTS`, and to the comment describing the events. `src/notifications/format.ts`: return `detail ?? ''` for it.
2. `src/remote/manager-reports.ts`: add `reportRemoteRefusal`.
3. `src/remote/entry-factory.ts`: in the `workspace-failed` arm, report and return when `entry.settled` is already true.
4. Run `./scripts/run.mjs check-diff` after each step.

## Tests

- `src/remote/manager.test.ts`: a channel that has reached `workspace-ready` then receives `workspace-failed`; assert `onFailed` is not called, no tab close, the channel is still returned by `get`, and `notify` is called with `remote-refused` on the creator label and a message naming the host and the refusal text.
- `src/remote/manager.test.ts`: a joined tab survives the creator's release, then a refusal arrives; the report names the joined tab.
- `src/remote/manager.test.ts`: a refusal before `workspace-ready` still rejects readiness and reaches `onFailed`, and reports nothing through `notify`.
- `src/notifications/format.test.ts`: `remote-refused` carries its detail verbatim.

## Out of scope

- A separate `refused` frame under a protocol bump.
- The server-side refusals pinned by `src/remote/serve.test.ts`, which stay as they are.
- A refused `session-state` query during an attach. The attach's own bounded wait in `askSessionState` already covers a peer that does not answer it.

## Documentation and specification impact

`product/specs/remote-server.md` gains a sentence under Failures: a refusal from the remote host after the workspace is ready leaves the tab open and is reported in the notifications feed. `product/specs/notifications.md` gains a `remote-refused` entry and lists it among the events with no toggle that bypass focus suppression. `help.md` and `documentation/user-documentation/` do not describe post-ready refusals and are left alone.
