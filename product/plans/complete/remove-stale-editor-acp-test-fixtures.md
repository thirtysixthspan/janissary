# Remove stale editorAcp fields from remaining test fixtures

**Complexity: 1/10** — 0 added lines, 0 production files, 2 requirements, 0 new scenarios (p=2.35)

## Goal

The earlier subplan removed `EditorAcpManager` from the `Managers` registry and deleted `src/editor/acp-manager.ts`, but 13 test fixtures still declare an `editorAcp` property. Those mocks advertise a manager that no longer exists, and a future move to strict typing would surface the stale fields as excess-property errors in unrelated tests. This plan removes only those dead fields so the fixtures match the surviving registry, changing no test behavior or assertions.

## Requirements

1. "Remove only the editorAcp entries (the connectionsFor, closeTab and noOp stubs) from those fixtures" — after the change, none of the 13 named test files declares an `editorAcp` property.
2. "no test behavior or assertion changes. Keep existing tests passing unchanged." — every existing assertion in the 13 files keeps passing exactly as it does today, with no surviving mock altered.

## Design decisions

- Each stale field is deleted from its fixture object literal rather than replaced with an inert stub, because no production consumer reads it any more (linked to Assumption 1).
- No editor scope is re-added to any wire type and the manager is not reintroduced; those removals are the goal of the parent work and are correct.
- No spec, help, or documentation edits accompany the change: no user-visible behavior changes and the recorded entry explicitly excludes them.

## Preserved behavior

1. The surviving manager stubs in the tab-release and plugin fixtures still pin the same teardown behavior; removing `editorAcp` must not change any surviving stub or assertion, and `src/plugins/teardown.test.ts` must keep passing.

## Assumptions

1. `editorAcp` is no longer a key on the manager registry — `src/managers.ts:73` (`export type Managers = { [Name in keyof ManagerRegistry]: ... }`) has no such member and neither tab-release list contains it.
2. The manager module is gone — `src/editor/acp-manager.ts` does not exist in the working tree.
3. The 13 fixtures' `editorAcp` fields are the only remaining occurrences in source — a repo-wide search for `editorAcp` matches only those fixtures, the backlog entry, and historical plan files; no assertion reads the field.
4. Every affected fixture is an object literal cast with `as unknown as Managers` or an `Object.assign` target, so deleting a property is type-safe and cannot change runtime behavior.

## Existing functionality

1. The `as unknown as Managers` cast lets a partial literal stand in for the full registry — `src/plugins/connections-topic.test.ts:57` (`} as unknown as Managers;`).
2. The `Object.assign(managers, { ... })` pattern augments a `TabManager` fixture with manager stubs — `src/tab/opening-state.test.ts:10` (`Object.assign(managers, {`).
3. The shared `noOpManager` stub supplies `closeTab` for the tab-release walk — `src/acp/record-feed.test.ts:693` (`const noOpManager = { closeTab: () => {} };`).
4. The tab-release walk consumes the surviving manager stubs through `closeTabResources` — `src/acp/record-feed.test.ts:702` (`await closeTabResources(...)`).

## Implementation steps

1. In each of the 13 named files, delete only the `editorAcp` property from its fixture object literal — the `connectionsFor` stub at `src/plugins/connections-topic.test.ts:47`; the `closeTab` stubs at `src/plugins/teardown.test.ts:33`, `src/plugins/update-tab.test.ts:42`, `src/plugins/snapshot-tab.test.ts:35`, `src/plugins/dock-tab.test.ts:34`, `src/plugins/launch-tab.test.ts:84`, `src/plugins/notifications.test.ts:62`, `src/plugins/launcher/host-lifecycle.test.ts:33`, `src/tab/opening-state.test.ts:18`, and `src/tab/manager.test.ts:62`; and the `noOp`/`noOpManager` stubs at `src/plugins/remote-join-capabilities.test.ts:53` and `src/acp/record-feed.test.ts:696`. On a shared line (launch-tab, host-lifecycle, remote-join-capabilities, record-feed) remove just that property and keep the neighbouring managers on the line; on a standalone line remove the whole line. Leave every other stub, assertion and import byte-for-byte unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. None. No user interface surface is modified or created; the change is confined to test fixtures.

## Tests

No new tests are introduced — the fix changes no application behavior and adds no code. The 13 existing test files named above are edited to drop the stale field and must keep passing unchanged; this is checked by `$janissary/scripts/run.mjs check-diff`, which runs the affected server tests.

## Out of scope

- No production code, wire type, or manager is added or restored.
- No functional spec, user/developer documentation, or help page is edited.
- No assertion, test name, or surviving mock is changed.

## Verification

End with `$janissary/scripts/run.mjs check-diff`. For a concrete reading-based check, run a repo-wide search for `editorAcp`: the only remaining matches should be the pull-request backlog entry and historical plan files, with none in `src/`. Then read the 13 fixtures and confirm each `as unknown as Managers` cast or `Object.assign` target still contains its other manager stubs (`closeTab`, `connectionsFor` on `monitor`, `noOpManager`, and so on) and that every assertion in those files is unchanged.
