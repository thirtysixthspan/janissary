# Custom-role persona sessions open a valid ACP connection record

**Complexity: 5/10** — ~30 added lines across 7 production files, 6 requirements and 12 validation/labeling scenarios (p=5.54).

## Problem

`promptPersonaRole` passes the persona's declared role to `beginCoreRecord` as the record source's `role`, casting the arbitrary string to `AcpRole`. `AcpSessionRecords.begin` then calls `isRecordSource`, which only accepts `role` values in `ACP_ROLES = ['ask', 'tell']`. A custom role such as `research` therefore throws `Invalid ACP record source.`; the `catch` in `promptPersonaRole` turns that into `ACP error: Invalid ACP record source.` and no launchable entry or connection record is ever used. Tightening the source to a core role would lose the declared name, while widening the core `role` field would break the strict built-in validation and the wire validators in the connections plugin.

## Goal

A persona declaring any role that resolves through the effective roles file opens a core ACP connection record and reaches its launchable entries instead of failing at begin. The record carries the declared role name in its own optional string field, so it stays queryable and is named after that role in the connections list and connection tabs. The built-in `ask` and `tell` record path keeps its exact, strict validation unchanged, and legacy records keep their current shape and names.

## Approach

1. Add an optional `declaredRole?: string` to the `acp` record-source variant and to the projected record row. It holds the persona's declared role name verbatim; the existing `role` field stays typed `AcpRole` and keeps meaning the built-in core role.
2. `promptPersonaRole` builds the record source with the default core role plus `declaredRole` set to the declared role string. The request still carries the declared role for session identity and command grants; only the durable source changes.
3. `isRecordSource` accepts `declaredRole` only as an optional nonempty string and only on an `acp` source. The existing `role` check (undefined or exactly a member of `ACP_ROLES`) is untouched, so `{ role: 'reader' }` is still rejected.
4. Thread `declaredRole` through row/window projection and through the connections wire contract: `recordConnectionName` prefers it over `role` for the `acp:<role>:<owner>` label, and the connections shared validators accept it as an optional nonempty string on record rows and window sources while rejecting it on agent and live rows.
5. No new module, protocol message, notification, or stored-version change; legacy records without the field are unchanged.

## Implementation steps

1. `src/acp-records/types.ts`: add `declaredRole?: string` to the `kind: 'acp'` source variant and to `AcpRecordRow`.
2. `src/acp-records/validation.ts`: in `isRecordSource` require `declaredRole` to be absent or a nonempty string for `kind: 'acp'`, leaving the `role` membership check as it is.
3. `src/acp-records/model.ts`: in `recordRow`, copy `source.declaredRole` onto the row when present; `recordWindow` already spreads the row and source.
4. `src/acp/record-feed.ts`: in `beginCoreRecord`, pass `declaredRole` from the source into `recordConnectionName` so the record name uses the declared role.
5. `src/acp/persona-role.ts`: set `role: DEFAULT_ACP_ROLE` and `declaredRole: role` on the source given to `beginCoreRecord`; keep the custom `role` on the pending request and the persona role state.
6. `src/plugins/connections/shared.ts`: add `declaredRole?: string` to `ConnectionSource` and `RecordConnectionRow`, prefer it in `recordConnectionName`, and accept it as an optional nonempty string in `isSource` and `isConnectionRow` while rejecting it on agent sources and live rows.
7. `src/protocol/connections.ts`: add `declaredRole?: string` to `ConnectionsTopicRecordRow`.
8. Run `$janissary/scripts/run.mjs check-diff` after the source changes, after each fix, and after the tests.

## Tests

- `src/acp/persona-role.test.ts`: make the record-source mock reject anything `isRecordSource` rejects, then add a case driving `promptPersonaRole` with a custom role that asserts it reaches the launchable entries, opens one connection record, returns an answered result, and stores `declaredRole` with the declared name; update the source assertion to the new shape; keep the unknown-role and no-enabled-models cases.
- `src/acp-records/validation.test.ts`: assert `declaredRole` accepts any nonempty string and rejects empty, whitespace-only, and non-string values; assert `role: 'reader'` is still rejected and `ask`/`tell` still accepted; assert `declaredRole` is rejected on an agent source.
- `src/acp-records/model.test.ts` and `src/acp-records/manager.test.ts`: assert rows and windows project `declaredRole`, a stored record with it reloads, and legacy sources keep no such field.
- `src/plugins/connections/shared.test.ts`: assert `recordConnectionName` prefers `declaredRole`, that legacy names are unchanged, and that `isConnectionRow`/`isConnectionsPayload` accept `declaredRole` on acp record rows and window sources but reject it on agent and live rows.

## Spec updates

- `product/specs/acp-records.md`: a core record opened for a persona session carries the persona's declared role name as optional metadata stored verbatim, in addition to the built-in core role, and rows/windows expose it.
- `product/specs/connections-tab.md`: an ACP record's Name and connection-tab title use the declared role name when present, otherwise the stored core role, otherwise the legacy role-less form.

## Documentation

- No help page or user-documentation page describes the record source or connection-row naming internals, so nothing to update.

## Out of scope

- No change to the canonical plan, the PR description, or the other backlog entry.
- No widening of the core `role` field or relaxation of `ask`/`tell` validation.
- No new stored schema version, protocol message, notification, or UI control.
- No new module; every touched file stays under the 200-line limit.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after each step and after the tests; never run `npm run check`. Confirm the final tree is green and that only this backlog entry was removed.
