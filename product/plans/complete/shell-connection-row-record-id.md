# Validate the Shell Connection Row's Record Id

**Complexity: 4/10** — an additive field on one mirrored contract type, one guard clause, and contract-test coverage; no schema bump, no behavior change for existing rows, and the popup and merge paths already carry the field.

## Goal

Make the shell plugin's published connection-row contract describe and validate the durable record id the popup opens, so a row's record target is typed and checked instead of surviving only through untyped object spread.

## Approach

`src/plugins/shell/shared.ts` re-declares `ConnectionView` as `ShellConnectionRow` because the module deliberately imports nothing. The protocol's `ConnectionView` gained `recordId` for the popup's record target, but the mirrored type and its `isConnectionRow` guard still stop at `text`, `kind`, and `acpRef`. The guard therefore accepts a non-string `recordId` and the payload carries it into the client as an invalid RPC parameter, while any future row rebuild that spreads only the declared fields would silently drop it.

Add `recordId?: string` to `ShellConnectionRow` with a comment naming it as the durable ACP or agent record the popup opens, and teach `isConnectionRow` to accept it only when absent or a string. Extend the contract test that pins the mirrored row against every protocol-admitted `ConnectionView` with a record row and a non-string rejection. `recordId` is additive, so `SHELL_PAYLOAD_SCHEMA_VERSION` stays 4 and the schema version has no other literal to keep in step — `src/plugins/shell/manifest.ts` and `web/src/plugins/registry.test.tsx` both read the shared constant.

## Implementation steps

1. Add an optional `recordId?: string` to `ShellConnectionRow` in `src/plugins/shell/shared.ts`, commented as the durable ACP or agent record the popup's row opens, mirroring `ConnectionView.recordId`.
2. Extend `isConnectionRow` so a present `recordId` must be a string.
3. In `src/plugins/shell/shared.test.ts`, add a record-id row to the `accepts every ConnectionView the protocol admits` case and a rejection case for a non-string `recordId`.
4. In `src/plugins/shell/activate.test.ts`, include a record-id row in the host-state merge case so the pushed slice is shown to keep the field it carries.
5. Update the host-state paragraph in `product/specs/tab-plugins.md` to state that pushed connection rows reach a plugin only in the shape its payload contract declares, so a malformed row is refused as an invalid payload.

The shell host-state merge in `src/plugins/shell/activate.ts` keeps its `as ShellPayload['connections']` cast: `TabPluginHostState.connections` is `unknown[]`, so the cast is the host boundary and is left untouched. `web/src/plugins/shell/ShellTabMeta.tsx` already hands `payload.connections` to `StatusPanels`, and its record-row test already exercises the field.

## Tests

- A connection row carrying a string `recordId` passes the payload guard, including as part of the every-`ConnectionView` acceptance case.
- A row whose `recordId` is a number, object, or `null` fails the payload guard.
- The host-state merge preserves a pushed row's `recordId` alongside the terminal row.
- Existing contract, shell activation, `ShellTabMeta`, and plugin-client-capability tests continue to pass.

## Out of scope

- Bumping `SHELL_PAYLOAD_SCHEMA_VERSION` or changing any payload schema version.
- Changing the host-state merge, the client capability, the popup, or the RPC parameter validation.
- Adding the protocol's `monitor` ACP reference scope to the mirrored `ShellAcpRef`, which the backlog did not name; only the durable record id is extended here.
- Adding user documentation where no page describes the plugin contract.
