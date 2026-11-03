# Plugin API v3 and ACP response panel removal

**Complexity: 3/10**

## Goal

Remove the obsolete in-tab ACP response surface after shell replies move to the background channel, restore docked pending-question visibility through the core question panel, and publish the breaking tab-plugin API v3 contract with a frozen v2 fixture.

## Decisions and dependencies

- Covers source-plan requirement 3 and implementation decision 32 / proposed change 6, including panel and hook removals, docked question preservation, API version 3, and fixture compatibility.
- Depends on shell/popup subplan 05 so asynchronous ACP answers already have their destination. It does not depend on documentation subplan 07.
- API v3 removes `useAcpResponse`, `TabView.acpResponse`, and the previously deprecated `launchShellHere()` shim. Keep `fixture-v1` unchanged and add `fixture-v2` as the frozen prior-version fixture.
- Pending questions on an active docked plugin tab remain visible through `PluginBody`'s core `QuestionPanel`, without an ACP response existing.

## Existing code to reuse

- Current response projection and lifecycle in `src/acp/response.ts`, `src/tab/view.ts`, and `web/src/shared/acp/`.
- Existing docked question state and `QuestionPanel` in `web/src/shared/questions/QuestionPanel` and plugin body layering.
- `src/plugins/fixture-v1/` compatibility fixture and API version guards/tests.

## Proposed changes

- Remove `acpResponse` from `TabView` and its server projection; remove `acpResponseFor` and the `useAcpResponse` export.
- Delete `AcpResponsePanel`, `AcpResponseScope`, `useAcpPanelActions`, `acp-panel-actions`, CSS, and associated tests. Remove the response prop from shell and plugin body/docked/layer components and stop rendering the panel.
- Render the core `QuestionPanel` from `PluginBody` when `dock !== null`, the plugin tab is active, and it has a pending question.
- Remove `launchShellHere()` and its implementation/warning from the client capability contract.
- Set `TAB_PLUGIN_API_VERSION` to 3. Add frozen `src/plugins/fixture-v2/` manifest/shared/activate/compatibility test based on the existing v2 shape. Assert explicit v2 declarations are refused under v3 and the shared round-trip succeeds when declared at v3.

## Tests

- Update web ACP response removal tests and add/adjust `web/src/plugins/PluginBody.test.tsx` for active docked pending questions without ACP response data.
- Add `src/plugins/fixture-v2/compatibility.test.ts`; retain v1 fixture tests and verify v2 refusal plus v3 round-trip.
- Run type checking to find every removed wire and capability consumer.

## Verification

- Run diff-scoped checks and production web build.
- Inspect plugin contract references so no runtime API v2 declaration remains in production catalog and no removed panel/hook import survives.

## Out of scope

- Shell background reply implementation (subplan 05), connection tabs, record/topic data, and remote cancellation.
- User-visible documentation; subplan 07 updates the API reference and behavior specs.
