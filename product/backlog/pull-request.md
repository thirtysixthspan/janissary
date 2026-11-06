<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Reduce introduced technical debt by sharing the canonical ACP role list with record validation.

Existing Issue: `src/acp/role.ts` defines `ACP_ROLES`, while `src/acp-records/validation.ts` and `src/acp-records/store.test.ts` separately hard-code the same role names. Severity: 3/10

Existing Risk: 3/10 - Adding an ACP role to the canonical type but missing either duplicate list could cause its saved records to be rejected on read and leave that role's round-trip behavior untested.

Proposal Risk: 1/10 - Validation and round-trip tests would follow the canonical role list, though the validator would still need to reject invalid role values.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1943 "share the ACP role vocabulary with record validation". Import `ACP_ROLES` from `src/acp/role.ts` in `src/acp-records/validation.ts` and use it to validate a present source role instead of maintaining `ACP_ROLE_NAMES`. In `src/acp-records/store.test.ts`, derive role round-trip cases from `ACP_ROLES` while retaining a separate unknown-role rejection case; keep the legacy record-without-role coverage intact.
