# Accept custom role names in the core client RPC decoders

**Complexity: 3/10** — 6 requirements and 8 scenarios in 1 production file with ~3 added lines (p=4.359).

## Goal

Core ACP connection rows now carry role names from the user-edited roles file, but the two websocket parameter decoders that route a tab-scoped `acpRef` still admit only the built-in `ask` and `tell` literals. As a result, opening the transcript snapshot or the durable record for a custom-role connection is rejected at the ingress boundary before it reaches the controller. The goal is to widen those two decoders to accept any non-empty role name, matching the validation already applied everywhere else a role crosses a boundary, so every catalog row can open its own transcript and record.

## Requirements

1. `openAcpTranscript` accepts a tab-scoped `acpRef` whose `role` is a custom, non-empty roles-file name such as `review-bot`. This is the issue text: "custom-role connection rows can open their transcripts and records."
2. `openConnectionRecord` accepts a tab-scoped `acpRef` whose `role` is a custom, non-empty roles-file name such as `review-bot`, while still requiring the reference's `label` to equal the popup-owning `tab`.
3. `openAcpTranscript` refuses a tab-scoped `acpRef` whose `role` is the empty string.
4. `openAcpTranscript` refuses a tab-scoped `acpRef` whose `role` contains only whitespace.
5. `openConnectionRecord` refuses a tab-scoped `acpRef` whose `role` is the empty string or contains only whitespace.
6. The connection catalog keeps emitting a `review-bot` row with a tab-scoped `acpRef`, pinned by `src/connection/catalog.test.ts`.

## Design decisions

- Validate the role by shape — a string with at least one non-whitespace character — rather than by membership in the built-in literal list, because the declared protocol type is `AcpRole = string` and the set of valid names is defined by the user's roles file, not by code. This mirrors the widening already landed in `src/plugins/connections/shared.ts`, `src/plugins/shell/shared.ts`, and `src/acp-records/validation.ts`.
- Keep the discriminant checks intact: only the `role` field widens. The `scope` union (`tab` | `monitor`), the required `label`/`name` fields, the `label === tab` equality in the record opener, and the exact-one-target rule are unchanged.
- Remove the stale editor-scope wording from the `openConnectionRecord` comment rather than leave a scope name that no longer exists in the `AcpRef` union.
- Scope the change to the two decoders and their tests: the other three validation surfaces are already widened, and the recorded work item calls for no spec, help, or documentation edits.

## Preserved behavior

1. The connection catalog emits a custom-role row with a tab-scoped `acpRef` whose `role` is `review-bot`; the row must still be produced with that exact reference and must not be dropped or renamed. `src/connection/catalog.test.ts` ("keeps the panel text apart from the name close accepts") pins it.
2. A tab-scoped reference in `openConnectionRecord` must still name the popup-owning tab itself; a reference whose `label` differs from `tab` must stay rejected. `src/client-params/core.test.ts` ("accepts a tab-scoped ACP target that names the popup-owning tab" and the decoder case table) pins it.
3. A monitor-scoped `acpRef` must still be accepted by `openAcpTranscript` and still be refused by `openConnectionRecord`. `src/client-params/core.test.ts` ("accepts the monitor scope of an ACP ref" and the decoder case table) pins it.
4. A non-object `acpRef` or a scope outside `tab`/`monitor` must stay rejected. `src/client-params/core.test.ts` (the `openAcpTranscript` case table) pins it.

## Assumptions

1. The protocol declares the field as an open string, not a literal union — `src/protocol/tab.ts:12` (`{ scope: 'tab'; label: string; role: AcpRole }`) and `src/acp/role.ts:3` (`export type AcpRole = string;`). The decoder's `ACP_ROLES` membership test is therefore stricter than its own declared contract.
2. The already-widened surfaces use a trimmed non-empty string check — `src/plugins/connections/shared.ts:80-82` (`isAcpRole`), `src/plugins/shell/shared.ts:141-146` (`isAcpRef`), and `src/acp-records/validation.ts:11-13` (`nonempty`). This is the pattern to match.
3. Role names originate from a user-edited roles file — `src/acp/role.ts:7` ("Role names come from a user-edited roles file") — so no finite code-side allowlist can enumerate them.
4. `isOneOf` remains in use by other decoders in the same file (`moveTab`, `reorderTab`, `setDock`), so only the `ACP_ROLES` import becomes unused — `src/client-params/core.ts:28,30,50`.

## Existing functionality

1. The shared `isString` guard — `src/client-params/guards.ts:12` — provides the type narrowing needed for a trimmed non-empty role check without a new helper.
2. The `ACP_ROLES` constant — `src/acp/role.ts:1` — is the built-in literal list being retired from these two decoders only.
3. The `CORE_PARAMS` decoder table — `src/client-params/core.ts:19` — is keyed by `CoreRpcCall['method']`, so changing an existing arm keeps the build-time exhaustiveness guarantee intact.
4. The parameterized decoder case table in `src/client-params/core.test.ts:6` supplies the accept/reject harness used for both affected methods.

## Implementation steps

1. In `src/client-params/core.ts`, change the tab arm of `isAcpRef` so that, after `isString(value.label)`, the `role` is accepted only when it is a string whose `trim().length` is greater than zero; this replaces the `isOneOf(value.role, ACP_ROLES)` membership test. Do not change the `monitor` arm or the `scope` checks.
2. In the same file, widen the `openConnectionRecord` arm the same way: replace `isOneOf(p.acpRef.role, ACP_ROLES)` with the trimmed non-empty string check, keeping the `p.acpRef.label === p.tab` equality and the exactly-one-target structure.
3. In the same file, remove the now-unused `ACP_ROLES` import at line 2, keep the `isOneOf` import (still used by `moveTab`, `reorderTab`, and `setDock`), and rewrite the `openConnectionRecord` comment to name only the monitor scope as snapshot-only, dropping the stale editor-scope reference.
4. Run `$janissary/scripts/run.mjs check-diff` and resolve any failures before moving on.

## UI design

None. This change widens two ingress decoders and their tests; it adds or changes no user interface. The visible effect is that an existing connections-panel row's transcript and record controls stop being rejected, but no component, layout, or key binding changes.

## Tests

1. Requirement 1 and requirement 3/4: in `src/client-params/core.test.ts`, add cases to the `openAcpTranscript` row proving a tab-scoped `acpRef` with a roles-file role name (`review-bot`) is accepted and that empty and whitespace-only roles are refused. Replace the obsolete `role: 'other'` invalid case, which the widening makes valid.
2. Requirement 2 and requirement 5: in `src/client-params/core.test.ts`, add cases to the `openConnectionRecord` row proving a tab-scoped `acpRef` with a roles-file role name (`review-bot`) is accepted and that empty and whitespace-only roles are refused, while the `label === tab` rule still holds. Replace that row's obsolete `role: 'other'` invalid case.
3. Requirement 6 / regression coverage: the existing `src/connection/catalog.test.ts` custom-role row assertions and the remaining `CORE_PARAMS` case-table rows must still pass; `$janissary/scripts/run.mjs check-diff` exercises them.

## Out of scope

- Editing any functional spec, help page, or user/developer documentation: the recorded work item calls for none.
- Changing the pull request title or description, or touching any other backlog entry.
- Re-widening `src/plugins/connections/shared.ts`, `src/plugins/shell/shared.ts`, or `src/acp-records/validation.ts`; those are already correct.
- Changing role semantics, the roles file format, the `AcpRef` scope union, or the other fields of either decoder.
- Adding a dependency or a new shared helper module for the trimmed non-empty check.

## Verification

`$janissary/scripts/run.mjs check-diff` first (lint, incremental typecheck, and the affected server tests, including `src/client-params/core.test.ts` and `src/connection/catalog.test.ts`). Then, against the running app with a custom role `review-bot` defined in the roles file, open a core ACP tab under that role and click the transcript button and then the row itself for the `acp:review-bot:` connection in the connections panel: the transcript and the record connection tab must open normally; a failure shows the call being refused by parameter validation with no transcript or record opening. Finally read `src/client-params/core.ts` and confirm both arms use the trimmed non-empty check, the `ACP_ROLES` import is gone, and the `openConnectionRecord` comment names only the monitor scope.
