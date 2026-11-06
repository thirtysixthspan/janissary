# Version connections payload for role bearing refs

**Complexity: 2/10** — one shared plugin schema version, its client registry literal, and focused compatibility assertions.

## Goal

Mark the connections payload shape change as incompatible because live tab-scoped ACP references now require a role, while retaining support for legacy role-less retained records.

## Approach

- Set `CONNECTIONS_PAYLOAD_SCHEMA_VERSION` in `src/plugins/connections/shared.ts` to 2. `src/plugins/connections/manifest.ts` reads that constant, so the server declaration will advertise the new version without a separate literal.
- Set the `connections` registration literal in `web/src/plugins/registry.tsx` to 2. Keep the client entry lazy; do not import the shared guard into the registry.
- Keep `RecordConnectionRow.role` and retained ACP source role optional. `isConnectionsPayload` must continue accepting a role-less retained record for old history, but reject a live tab-scoped `acpRef` whose role is absent or invalid.
- Update the schema assertion and compatibility cases in `src/plugins/connections/shared.test.ts`, and explicitly pin the connections client registration version in `web/src/plugins/registry.test.tsx`. Preserve `web/src/plugins/PluginBody.test.tsx` coverage that rejects a payload when its schema does not match the registered version.
- Correct `product/plans/complete/role-aware-acp-connection-identity.md` to explain that the live tab reference requires the version bump even though retained record roles remain optional.

## Tests

- `src/plugins/connections/shared.test.ts`: assert schema version 2; keep role-less retained records and sources accepted; reject a role-less tab-scoped ACP reference in a live row.
- `web/src/plugins/registry.test.tsx`: assert the connections registration is version 2 and remains in parity with the shared contract constant.
- Preserve the generic mismatch refusal test in `web/src/plugins/PluginBody.test.tsx`.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` after the implementation and after the final plan/spec edits.
- Confirm `connectionsManifest.payloadSchemaVersion` and the lazy client registry both advertise version 2.
- The existing `product/specs/tab-plugins.md` already states that a schema mismatch disables only the incompatible plugin; no user-visible behavior or additional spec change is needed.

## Specs and documentation

No spec or user documentation change is needed because the generic schema-mismatch behavior is already described in `product/specs/tab-plugins.md` and user-visible behavior is unchanged.

## Out of scope

- Requiring roles on retained record rows or changing how role-less legacy history is named and displayed.
- Changing the generic schema mismatch handling or other plugin schema versions.
