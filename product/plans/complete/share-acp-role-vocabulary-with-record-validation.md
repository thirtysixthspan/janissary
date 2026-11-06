# Share ACP role vocabulary with record validation

**Complexity: 2/10** — replaces two duplicated role-name lists with the existing canonical ACP role tuple and verifies every role through record round-trip tests.

## Goal

Keep ACP record validation and role round-trip coverage aligned with the canonical role list in `src/acp/role.ts`.

## Approach

- Import `ACP_ROLES` from `src/acp/role.ts` in `src/acp-records/validation.ts`, using the `.js` relative import extension. Validate a present ACP source role by checking the canonical tuple; continue accepting a missing role for legacy records and rejecting unknown values.
- Import `ACP_ROLES` in `src/acp-records/store.test.ts` and derive the role-tagged record round-trip cases from that tuple. Keep the separate invalid-role case and legacy record without role case.
- This is an internal consistency change with no observable behavior change for valid records, so no functional spec or user documentation update is needed.

## Tests

- `src/acp-records/store.test.ts`: round-trip one record for every role in `ACP_ROLES`, keep rejecting an unknown role, and retain legacy role-less record coverage.
- Run `./scripts/run.mjs check-diff` after the implementation and test changes.

## Out of scope

- Adding or renaming ACP roles.
- Changing record schema compatibility or validation behavior for any other source field.
