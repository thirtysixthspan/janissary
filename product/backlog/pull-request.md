<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle the functionality gap caused by accepting old connections payloads as schema 1 after ACP tab references gained a required role.

Existing Issue: The connections payload remains schema 1 even though its guard now rejects tab-scoped ACP references without a role, so an older schema-1 payload can pass the plugin envelope check and then fail the current payload validator. Severity: 5/10

Existing Risk: 5/10 - A restored connections tab with a role-less live ACP reference can be treated as current and then rejected by the plugin, leaving its connection list unavailable until refreshed or reopened.

Proposal Risk: 2/10 - The new payload shape has an explicit version boundary, so stale data is recognized as incompatible before the stricter row guard runs; legacy role-less retained records remain valid.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1943 "version the connections plugin payload for required ACP roles". The role-aware tab reference is now required in `ConnectionsPayload` rows, but `CONNECTIONS_PAYLOAD_SCHEMA_VERSION` in `src/plugins/connections/shared.ts` remains 1. Bump it to 2 so `src/plugins/connections/manifest.ts` and the client registration in `web/src/plugins/registry.tsx` advertise the same incompatible shape, and update the completed subplan `product/plans/complete/role-aware-acp-connection-identity.md` to explain that only the retained record role is optional for legacy data. Update the version assertion in `src/plugins/connections/shared.test.ts` and pin the connections registration in `web/src/plugins/registry.test.tsx`; preserve the existing role-less retained-record acceptance coverage in `src/plugins/connections/shared.test.ts`. The schema mismatch handling in `web/src/plugins/PluginBody.test.tsx` must continue to reject a payload whose version does not match the registered plugin.
