# Drop per-persona connection rows and the editor-scope ACP reference

**Complexity: 4/10** — ~20 added lines but 17 production files touched by the removal, 3 requirements and 6 row/close/transcript scenarios (p=5.20)

## Goal

Now that editor queries and monitors both run on the core pipeline, the per-persona connection plumbing is dead. This subplan removes `EditorAcpManager` and every editor-scope `AcpRef` branch across server, wire and client, so a persona query uses the tab's existing core role connection row and the generic close path. The editor query line, its status pill and the four preserved behaviors are not touched.

This subplan decomposes `./product/plans/complete/ai-personas.md` and depends on `./product/plans/ready/ai-personas-1-role-directive-format.md`, `./product/plans/ready/ai-personas-2-role-resolution-and-validation.md`, `./product/plans/ready/ai-personas-3-core-role-widening-and-generic-close.md`, `./product/plans/ready/ai-personas-4-editor-queries-on-the-core-acp-pipeline.md` and `./product/plans/ready/ai-personas-5-monitors-on-the-core-acp-pipeline.md`.

## Requirements

1. "Drop persona rows; reuse core role rows" — a persona query uses the tab's existing core role connection row; there is no `<persona> (acp)` row or persona-specific close control.
2. "Extend generic close to any role" — closing the core row goes through `connections close acp:<role>:<model>` or the row's existing Close control; the `closeEditorConnection` route is removed and no persona-specific close path remains.
3. Connection catalog and close tests no longer expect editor-persona rows, and transcript coverage follows the removed `AcpRef` branch.

## Design decisions

- `EditorAcpManager` is deleted as a whole: its session map, context store, `connectionsFor`, `close`, `closeTab` and `dispose` methods have no remaining production consumer after subplan 4 (linked to Assumption 1). Removing the class is preferred over leaving a dead manager on `Managers`.
- The editor-scope `AcpRef` variant is removed from the shared wire type and both import-free mirror contracts, so a row that claims editor scope without a persona is no longer expressible (linked to Assumption 2 and Assumption 3). Payload schema versions stay unchanged because the remaining row shapes do not change.
- `closeEditorConnection` and its adapter method are removed end to end: the `ClientMessage` variant, the dispatcher case, the controller façade method, the adapter wiring and the client call sites. Generic `connections close acp:<role>:<model>` from subplan 3 is the only dismissal path (linked to Assumption 4).
- `controller/transcript.ts` drops its editor branch; core rows already carry a durable record id, so the core path opens the right connection tab without a persona transcript snapshot (linked to Assumption 5).
- The generic core close path keeps the connections window's existing focus behaviour and accessible row name; no new control or key binding is added.

## Preserved behavior

None found here. The four query-line and status-pill behaviors are owned and pinned in subplan 4; this subplan deliberately leaves them and their tests unedited.

## Assumptions

1. `editorSuggest` no longer calls `EditorAcpManager` after subplan 4, leaving the manager's maps unused — `src/editor/acp-manager.ts:19-24` (`private sessions = new Map<string, AcpSession>();` and the neighbouring maps).
2. The shared `AcpRef` union still declares an editor variant — `src/protocol/tab.ts:14` (`| { scope: 'editor'; label: string; persona: string };`).
3. The connections and shell plugin mirrors repeat that variant in their guards — `src/plugins/connections/shared.ts:44` and `src/plugins/shell/shared.ts:33`.
4. `closeEditorConnection` is a client message routed through the controller adapter — `src/message/editor.ts:31-34` and `src/controller/editor-adapter.ts:37`.
5. `openAcpTranscript` handles the editor scope explicitly today — `src/controller/transcript.ts:32-33` (`name = acpRef.persona; text = managers.editorAcp.transcript(...)`).
6. `connectionCatalog` still appends editor-persona rows from `managers.editorAcp.connectionsFor` — `src/connection/catalog.ts:38`.

## Existing functionality

1. `connectionCatalog` is the single list every connection surface reads — `src/connection/catalog.ts:73` (`export function connectionCatalog`).
2. `closeConnection` routes an `acp:` close through `closeAcp` — `src/connection/close.ts:73`.
3. The core role row already carries `recordId` for the generic transcript path — `src/protocol/tab.ts:23` (`recordId?: string;`).
4. The generic close path from subplan 3 resolves any role name — `src/connection/close.ts:15` (`function coreAcpTarget`).

## Implementation steps

1. In `src/connection/catalog.ts`, remove the `managers.editorAcp.connectionsFor(label)` row source and the `acpId` editor branch, leaving only core role rows plus the monitor name rows that still exist. In `src/connection/close.ts`, remove the `managers.editorAcp.close(label, id)` call from `closeAcp`. In `src/controller/transcript.ts`, remove the editor branch (`acpRef.persona` and the `managers.editorAcp.transcript(...)` call) so no production module outside the manager itself reads `managers.editorAcp` after step 3. Build command: `$janissary/scripts/run.mjs check-diff`.
2. In `src/managers.ts`, remove the `editorAcp` field and both registry entries: `'editorAcp'` in `MANAGER_DISPOSE_ORDER` (around line 112) and in `MANAGER_TAB_RELEASE` (around line 162). In `src/controller/create-managers.ts`, remove the `new EditorAcpManager(managers)` construction. Tab close then releases only core sessions through the surviving `'acp'` entry; no separate `editorAcp.closeTab` call site exists to edit. The exhaustive `satisfies readonly (keyof Managers)[]` checks in that file will catch a missed entry at compile time. Build command: `$janissary/scripts/run.mjs check-diff`.
3. Delete `src/editor/acp-manager.ts` and its colocated test once no production import remains. Confirm no `spawnMonitorSession` or monitor-context import survives from that file. Build command: `$janissary/scripts/run.mjs check-diff`.
4. Remove the editor-scope `AcpRef` variant from `src/protocol/tab.ts`, `src/plugins/connections/shared.ts` (type, `isAcpRef` guard and `ConnectionRowBase`) and `src/plugins/shell/shared.ts` (`ShellAcpRef` and `isAcpRef`). The transcript's editor branch is already gone from step 1, so only tab-scoped core rows remain. Build command: `$janissary/scripts/run.mjs check-diff`.
5. Remove the `closeEditorConnection` message end to end: `src/protocol/editor.ts`, `src/client-message.ts`, `src/message/editor.ts`, `src/message/handler.ts`, `src/controller/editor-adapter.ts`, the `client.send` call in `web/src/editor/useEditorConnections.ts:28`, and the editor-scope close handler in `web/src/editor/EditorConnectionsPanel.tsx:19` (`canCloseRow={(row) => row.acpRef?.scope === 'editor'}`), which becomes a plain read-only row. Update the colocated message and adapter tests to stop expecting the route. Build command: `$janissary/scripts/run.mjs check-diff`.
6. Update the tests named below and confirm the four preserved-behavior tests from subplan 4 are untouched and green. Build command for every step: `$janissary/scripts/run.mjs check-diff`; every step leaves the tree green.

## UI design

1. The connections window shows the core `acp:<role>:<provider/model>` row only; the `<persona> (acp)` row and its persona-specific Close control are gone. Row placement, ordering and focus behaviour are otherwise unchanged.
2. Dismissal uses the generic core close path: `connections close acp:<role>:<model>` or the core row's existing Close control, with the existing accessible name and no new binding.
3. The editor query line, the `editor-suggest-pill` badge, `EditorLine`'s `editor-row-query` class and all status-pill wording are unchanged; no CSS changes.

## Tests

1. `src/connection/catalog.test.ts` and `src/connection/close.test.ts` no longer expect editor-persona rows or an `editorAcp.close` call (Requirement 1 and Requirement 3).
2. `src/controller/transcript.ts` coverage (its colocated test) follows the removed editor `AcpRef` branch and asserts the core row still opens its connection tab (Requirement 3).
3. `src/message/handler.test.ts` and `src/controller/editor-adapter.test.ts` drop the `closeEditorConnection` route expectations (Requirement 2).
4. Client tests in `web/src/editor/useEditorConnections.test.ts`, `web/src/editor/EditorConnectionsPanel.test.tsx`, `web/src/editor/EditorTab.test.tsx` and `web/src/shared/status-windows/StatusPanels.test.tsx` drop editor-scope fixtures and assert that only core rows offer the generic close (Requirements 1 and 2).
5. The mirrored plugin guard tests confirm an editor-scope `acpRef` is now refused (Requirement 1).

## Out of scope

- The prose documentation page is still a follow-up candidate recorded in subplan 7.
- No change to the core role rows, generic close resolution or the monitor path, all delivered in earlier subplans.
- `help/keys.md` gains no entry because no key binding changes.

## Verification

End with `$janissary/scripts/run.mjs check-diff`. For a concrete end-to-end check against the running app, run an editor persona query, open the connections window and confirm exactly one core `acp:<role>:<provider/model>` row is present with no `<persona> (acp)` row, then close it with `connections close acp:<role>:<provider/model>` and confirm the row disappears through the generic close line without any persona-specific control having been involved.
