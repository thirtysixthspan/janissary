# Native commands: complete the remaining web socket state fixtures

**Complexity: 1/10** — two fixture literals in one test file, no production code, and a focused test run.

## Goal

Make every full `StateEvent` fixture in `web/src/shared/ws/ws.test.ts` carry the required `disabledApplicationCommands` field, so the web socket tests mirror the current server snapshot shape. The minimal `{ t: 'state', tabs: [] }` events used by the reconnection tests stay unchanged because they are not full snapshots.

## Decisions and dependencies

- Depends on completed unit 10 in `product/plans/complete/native-commands-10-client-integration.md`, which made `disabledApplicationCommands` a required `StateEvent` field and updated the other web fixtures.
- Add `disabledApplicationCommands: []` to the state event in the `normalizes %s dialog fields to null` `it.each` case and to the state event in the adjacent dispose test that sends a later state event. The dispose test sits directly before the toast test; it is the remaining full fixture the backlog entry calls the toast test.
- Leave the reconnection tests' minimal `{ t: 'state', tabs: [] }` messages as they are; they exercise reconnect bookkeeping rather than a complete snapshot.
- No production behavior changes, no spec change, and no help or user-documentation change.

## What already exists (reuse, don't rebuild)

| Need | Existing implementation |
| --- | --- |
| Required state field | `src/protocol/events.ts` `StateEvent.disabledApplicationCommands` |
| Already-updated fixtures | `web/src/shared/ws/ws.test.ts` full snapshots elsewhere in the file |
| Minimal reconnection events | `web/src/shared/ws/ws.test.ts` reconnection tests |

## Proposed changes

1. In `web/src/shared/ws/ws.test.ts`, add `disabledApplicationCommands: []` to the `it.each` state event used by `normalizes %s dialog fields to null`.
2. Add the same field to the full state event in `dispose stops state listeners being called for a later state event`.
3. Leave every other fixture, including the minimal reconnection events, untouched.

## Tests

- Run the focused web socket test file and confirm every case passes with the updated fixtures.
- Run `$janissary/scripts/run.mjs check-diff` to confirm lint, typecheck, and related tests stay green.

## Out of scope

- Production code, the `StateEvent` contract, and server behavior.
- The reconnection tests' minimal state events.
- Specs, help pages, and user documentation.
- The other open pull-request backlog entry.
