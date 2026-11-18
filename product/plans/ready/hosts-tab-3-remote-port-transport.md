# Honor saved ports in SSH transport commands

**Complexity: 3/10** — ~18 added production lines in 2 files, 5 requirements and 7 scenarios (p=4.717)

## Goal

Make remote channel transport accept a port supplied by a validated saved endpoint. Source plan: `product/plans/complete/hosts-tab.md`. This transport change has no earlier dependency.

## Implementation

Add optional `port` (number) and `hostName` (string) to `RemoteAddress` in `src/remote/address.ts:21`. The endpoint resolver and parked-record reader own validation before setting `port`. Preserve `parseRemoteAddress` at `src/remote/address.ts:41`: a token like `devbox:2222` still parses with path `2222` and no port or saved name.

Reuse `sshRemoteCommand` at `src/remote/entry-factory.ts:41` for both `remoteServeCommand` and `remoteCaptureCommand`. Append `-p <port>` among the existing SSH options and before the destination. For saved addresses identified by `hostName`, put `--` immediately before the destination so a leading hyphen is part of the host operand. Keep `-t`, the capture options `BatchMode`, `NumberOfPasswordPrompts` and `ConnectTimeout`, and the existing quoting of `$SHELL` and the remote `janus remote-serve` command. Literal addresses keep the exact existing command shape.

`createRemoteEntry` already closes its `connect` callback over the address at `src/remote/entry-factory.ts:162` and passes that callback to `Attach`. The initial connection and `Attach` retries in `src/remote/attach.ts:69` therefore use the same resolved port and path. Keep this transport change in the shared builder so the independent `queryParkedCapture` caller in `src/harness/capture/remote.ts:52` can use it once the parked-record plan restores those fields.

## Tests and verification

Extend the existing `remoteServeCommand` and `remoteCaptureCommand` tests in `src/remote/manager.test.ts`: retain exact literal command assertions, then cover saved port and path, capture flags plus port, and a saved destination beginning with a hyphen when no port is present. Extend `src/remote/address.test.ts` for the numeric-looking literal path and absent fields. Use `managerHarness` and its fake `spawnTransport` to compare the initial and retried transport command for one resolved address. Run `$janissary/scripts/run.mjs check-diff`. Inspect generated SSH arguments in that transport fixture.

## Out of scope

Resolving host names, persisted records and the plain SSH tab.
