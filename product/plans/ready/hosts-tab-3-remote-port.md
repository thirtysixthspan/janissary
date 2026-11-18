# Carry saved SSH ports through remote session transport

**Complexity: 5/10** — ~65 added lines, 7 existing files and 10 scenarios (p=5.65)

## Goal

Work unit 3 of [Hosts Tab](../complete/hosts-tab.md). Depends on [Select and persist the effective hosts file](../ready/hosts-tab-2-host-storage.md).

## Implementation

- Add optional numeric `port` and string `hostName` to `RemoteAddress` in `src/remote/address.ts`. Keep the parser and literal address syntax unchanged. A resolved address's `address` string represents the literal destination and optional path so it stays parseable without the hosts file.

- Build `-p <port>` in `sshRemoteCommand` in `src/remote/entry-factory.ts:41`, shared by `remoteServeCommand` and `remoteCaptureCommand`. Keep the capture flags and remote command intact. For a saved destination, place the SSH end-of-options delimiter after the flags and before the destination, including when no port is set. Preserve the existing literal invocation shape.

- Add both optional fields to `RemoteSessionRecord` and guard them in `isRemoteSessionRecord` in `src/sessions/store.ts:100`. Accept older records with both fields absent. If present, the port must be an integer from 1 through 65535 and the launch name must be a nonempty string. Follow the existing guard behavior for malformed records. Copy both fields from the channel's address in `recordOf` in `src/sessions/snapshot.ts:118` and omit absent fields.
- Give `startSessionAttach` in `src/sessions/attach.ts:81`, `terminateParkedSession` in `src/sessions/terminate-session.ts:37`, and parked capture in `src/harness/capture/remote.ts:26` one shared restore helper in `src/sessions/record-address.ts`. It parses the persisted literal `address`, preserves each caller's handling of a parse failure, and restores optional metadata from the validated record. The SSH bridge receives that restored address through attach. Changes to saved hosts after launch have no effect on these operations.

## Tests

Cover serve and capture command construction with the original literal route, a saved port, and a saved destination without a port. Assert the destination follows the SSH option delimiter on saved launches. Add record coverage for valid fields, invalid ports, invalid names and old records in `src/sessions/store.test.ts`. Extend the existing shell park/attach round trip, standalone termination test and parked capture test to verify the recorded destination and port drive the invocation. Assert the saved name survives the park and attach round trip.

## Out of scope

Name lookup and Sessions rendering.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Inspect the port used during a park and attach round trip in an existing SSH fixture.
