# Reuse the launch endpoint when reconnecting to parked sessions

**Complexity: 5/10** — ~34 added production lines across 5 existing files, 13 scenarios (p=5.385)

## Goal

Retain the validated endpoint and saved launch name across park, attach, terminate and detached capture. Source plan: `product/plans/complete/hosts-tab.md`. Depends on `product/plans/ready/hosts-tab-3-remote-port-transport.md`.

## Implementation

Add optional `port` and `hostName` fields to `RemoteSessionRecord` in `src/sessions/store.ts:44`. In `isRemoteSessionRecord` at line 100, require a present port to be a number and an integer in 1–65535. Require a present host name to be a nonempty string. Absent fields keep existing records valid, including those in the pre-account-keying file. Follow the current guard and load behavior, which drops invalid records individually. Copy both fields when present from `RemoteEntry.address` in `src/sessions/snapshot.ts:118` (`recordOf`). The existing `mirror` and `sameRecord` at `src/sessions/manager.ts:201` and `src/sessions/manager.ts:257` already save a record when its description changes.

Keep the record's `address` as the resolved `[user@]host[:path]` token. Add a pure `addressFromSessionRecord` in `src/sessions/record-address.ts`. Use `parseRemoteAddress` in `src/remote/address.ts:41` to recover destination, host, and path, then restore the record's validated optional fields. A parse failure returns the existing parser error. The conversion has no catalog dependency, so later edits or deletion cannot change the endpoint or saved launch name.

- In `src/sessions/attach.ts:81` (`startSessionAttach`), pass the reconstructed address to either `managers.harness.attachRemote` or `startSshBridge`. The bridge at `src/sessions/ssh-bridge.ts:20` already forwards the entire address to `startRemoteLaunch`. Keep the current failed-attach result before opening anything for an invalid address.
- In `src/sessions/terminate-session.ts:37` (`terminateParkedSession`), pass the same reconstructed address to `managers.remote.create`. Preserve the existing failure result before opening a transport for an invalid address.
- In `src/harness/capture/remote.ts:22` (`queryParkedCapture`), pass it to `remoteCaptureCommand` and keep returning an absent result before spawn for an invalid address.

## Tests and verification

Extend `src/sessions/store.test.ts` and `src/sessions/snapshot.test.ts` for writing and reading both optional fields, old records, and malformed ports or names. In `src/sessions/attach.test.ts` and `src/sessions/terminate-session.test.ts`, assert the recorded endpoint reaches both attach branches and the terminate transport. In `src/harness/capture/remote.test.ts`, assert that the command passed to `spawnTransport` retains the recorded port and uses the existing capture options. Keep the existing invalid-address expectations for attach and terminate and add the no-spawn capture case.

Document the recorded endpoint behavior in the parking section of `product/specs/remote-server.md`. Run `$janissary/scripts/run.mjs check-diff`. Exercise the park/attach sequence in `src/sessions/shell-roundtrip.test.ts` with an injected resolved address carrying port 2222 and saved name `lab`. Replace the scratch hosts file before attach, then inspect the resumed transport and confirm it still uses port 2222 and carries `lab`.

## Out of scope

Generating saved endpoints from new launches and changing Sessions display.
