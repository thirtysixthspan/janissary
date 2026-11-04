<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Extend the shell plugin's published connection-row contract with the new durable record id so the popup's record target is validated and typed, not smuggled through an unchecked cast.

Existing Issue: `ConnectionView` gained `recordId` and the shell popup now depends on it, but the shell plugin's mirrored `ShellConnectionRow` in `src/plugins/shell/shared.ts` still declares only `text`, `kind`, and `acpRef`: `isConnectionRow` validates no `recordId`, the contract test in `src/plugins/shell/shared.test.ts` no longer covers every `ConnectionView`, and `src/plugins/shell/activate.ts` passes the field through with an `as ShellPayload['connections']` cast. Severity: 4/10

Existing Risk: 4/10 - The popup works only because the object survives untyped; a payload with a non-string `recordId` passes the plugin guard and is sent as an invalid RPC parameter, and any future row mapping or contract change silently drops the field and disables row opening.

Proposal Risk: 1/10 - Adding an optional, validated string to the mirrored type and its guard changes no behavior for existing rows; the only hazard is leaving a second copy unupdated, which the extended contract test pins.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "add recordId to the shell plugin's connection row contract". In `src/plugins/shell/shared.ts`, add `recordId?: string` to `ShellConnectionRow` (comment that it is the durable ACP or agent record the popup opens, mirroring `ConnectionView.recordId`) and extend `isConnectionRow` with `(value.recordId === undefined || typeof value.recordId === 'string')`. In `src/plugins/shell/shared.test.ts`, add a `recordId` row to the `accepts every ConnectionView the protocol admits` case and a rejection case for a non-string `recordId`; pinning the re-declared row against `ConnectionView` is that file's purpose. Leave `web/src/plugins/shell/ShellTabMeta.tsx` (it already passes `payload.connections` to `StatusPanels`) and the shell host-state merge in `src/plugins/shell/activate.ts` as they are: `recordId` is additive, so `SHELL_PAYLOAD_SCHEMA_VERSION` does not need a bump and `web/src/plugins/registry.tsx`'s literal stays 4. Verify with `src/plugins/shell/shared.test.ts`, `web/src/plugins/shell/ShellTabMeta.test.tsx`, and `web/src/plugins/plugin-client-capabilities.test.ts`; manually click a record-id row in a shell popup and confirm it opens the record tab.


* Consolidate the connection-record-tab rules the new connections-tab spec restates from the connection and acp-records specs, and keep the streamed-follow nuance in one place.

Existing Issue: `product/specs/connections-tab.md` newly restates the record-tab follow behavior and the 20-block window that `product/specs/connection.md` and `product/specs/acp-records.md` already own, and its one-line version omits the rule that streamed updates to the latest activity entry keep following without a new entry. Severity: 3/10

Existing Risk: 3/10 - Two binding specs now describe the same follow and window behavior, and the newer copy is the weaker one, so a future change to history following can update one and leave the other stale.

Proposal Risk: 1/10 - Moving a paragraph and linking it changes no code, but the docs build must still resolve the wiki link.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "consolidate the duplicated connection-tab follow and window rules". Decide one home for the record-tab behavior: either move the "Connection record history" paragraph from `product/specs/connection.md` into the "The connection tab" section of `product/specs/connections-tab.md` and leave a `[[connections-tab]]` pointer in `connection.md`, or trim `connections-tab.md`'s restatement to a link to `[[connection]]`. Carry the full streamed-follow rule ("streamed text updates to the latest activity entry, even when no new entry is added", verified by the completed `follow-streamed-connection-activity` repair) into whichever file owns it, and let `product/specs/acp-records.md` keep ownership of the 20-block window and paging so `connections-tab.md` links to it rather than repeating the number. Keep the popup-opening section of `connections-tab.md` as it is; that is this subplan's new promise. Verify by reading the three specs for one home per rule and by building the docs site; no code or test changes.
