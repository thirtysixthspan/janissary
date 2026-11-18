# Show the saved launch name in the Sessions Host column

**Complexity: 5/10** — ~24 added lines, 6 existing files and 10 scenarios (p=5.26)

## Goal

Work unit 6 of [Hosts Tab](../complete/hosts-tab.md). Depends on [Carry saved SSH ports through remote session transport](../ready/hosts-tab-3-remote-port.md), [Resolve saved hosts in remote launch executors](../ready/hosts-tab-4-remote-name.md), [Open SSH tabs using saved names](../ready/hosts-tab-5-ssh-name.md).

## Implementation

- **Sessions Host column (user decision).** Only a session launched through a saved host — `ssh <name>`, `on <name>`, or a host row — shows that host's name in the Host column; a session started from a typed address keeps the bare host. The name is the one used at launch, recorded with the session (including the parked-session record), and shown for the session's whole life even if the host entry is later renamed or deleted.

### Server snapshots and rows

- Copy the launch name from `entry.address.hostName` in `src/sessions/snapshot.ts:42` (`channelOf`) and from `tab.harness?.hostName` in `src/sessions/snapshot.ts:62` (`sshTabs`). Give `SessionChannel` and `SessionSsh` optional `hostName` fields in `src/sessions/rows.ts` and forward them in `liveRows` and `sshRow`. Every member of a live channel uses that channel's recorded name.
- Take the saved name for parked rows directly from `RemoteSessionRecord.hostName` in `src/sessions/rows.ts:150` (`detachedRows`). Reattached channels get that metadata through the address restore in unit 3. In `src/sessions/actions.ts:109` (`terminatedRowFrom`), copy the name before the record is dropped. Carry it through the optional field on `SessionTerminated` and into `terminatedRow`. Both the attach and terminate actions use that constructor.
- Omit the optional field when launch metadata lacks a name. Preserve `host` as the bare host and `destination` as the existing destination. Row composition never reads the hosts catalog. If `src/sessions/rows.ts` exceeds the lint limit, extract the cohesive SSH row type and builder into `src/sessions/ssh-rows.ts`.

### Payload and display

- Add optional string `hostName` to `RemoteSessionView` in `src/protocol/sessions.ts:21` and the plugin's existing `SessionRow` contract in `src/plugins/sessions/shared.ts`. Extend `isSessionRow` to accept an absent name or a string. Keep the payload schema version because rows with no saved name still pass the guard.
- Read `row.hostName ?? row.host` in both layouts in `web/src/plugins/sessions/SessionRowBody.tsx`. Leave the destination-based tooltip and existing action confirmation text in `SessionList.tsx` as they are. Update the Host column description in `product/specs/sessions-tab.md` to explain launch-time naming and the literal fallback.

## Tests

Extend `src/sessions/snapshot.test.ts` and `src/sessions/rows.test.ts` to follow the optional value from launch snapshots through live channel members, SSH tabs, parked and terminated rows. Check the action paths in `src/sessions/actions.test.ts` when attach discovers a session is over and when termination succeeds. Keep a literal row on the same destination to establish that only saved launch metadata changes the display. Exercise valid named and unnamed rows and reject non-string names in the Sessions payload guard tests. In `web/src/plugins/sessions/SessionList.test.tsx`, assert the saved name in both layouts, bare hostname fallback, and the full destination on the enclosing row tooltip.

## Out of scope

Inferring names from typed addresses.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Launch one saved-name remote session and one literal session to the same fixture. Compare the Host cells and destination tooltips in wide and narrow layouts. Park the saved-name session, rename or delete its catalog entry, then reattach and confirm the original name persists. Confirm the name also survives in the terminated row when that session ends through the Sessions action.
