# Remove the model catalog from Roles

**Complexity: 4/10** — the work removes one UI column and its drag paths while adding a server-derived missing marker to a versioned roles payload.

## Goal

Make the roles tab edit roles only. Remove catalog drags and show role entries that are unavailable in the effective catalog as dimmed rows with the exact tooltip.

## Decisions and dependencies

- Depends on completed `product/plans/complete/models-host-topic.md` and `product/plans/complete/models-catalog-consumers.md`. The roles plugin subscribes to `models` and gets the effective enabled model ids through its existing `harnessLaunchCatalog` capability.
- Keep the `rolesManifest` capabilities in `src/plugins/roles/manifest.ts:12-26` exactly `openOrFocusTab`, `updateTab`, `originTab`, `harnessLaunchCatalog`, `rejectRequest`, and `reportFailure`; add `notifications: ['models']` as the separate topic declaration. Because `validateActivation` in `src/plugins/activate.ts:63-70` requires a `notify` handler whenever notifications are declared, add that handler to the roles activation. Do not add `topicData` or `topicAction`; the payload uses `harnessLaunchCatalog`.
- Keep `roles.json` unchanged. Build a payload-only copy of each role entry and mark it `missing: true` when the entry's model id is not in the effective enabled list for its harness. Check that harness as an own key of `catalog.models` before reading its list, so arbitrary stored harness names such as `constructor` cannot resolve through an object prototype. A hidden model remains in `modelsFor` and is not missing; a disabled model is excluded and is missing. Do not mutate `RolesRead.roles` while deriving this marker.
- Remember the most recently resolved project root from each command or intent. Resolve and capture the root at action entry, before queued edits wait; use that captured root for that action's file read/write/publication and update the remembered root for later notifications. A `models` notification has no originating tab, so republish from the latest remembered root and a fresh `harnessLaunchCatalog()` result rather than calling `originTab()` or retaining a stale catalog.
- The manager emits `models:changed` for each `refreshing` transition and after a successful catalog write; the roles plugin republishes on every `models` notification so all active role tabs receive the latest catalog-derived marker. This only updates the payload and never edits `roles.json`.
- Bump the roles payload schema from 1 to 2. Add optional boolean `missing` to the shared `RoleEntry` payload type and validate it when present; entries without the field remain valid, and the roles file decoder continues to return only persisted fields.

## Existing code to reuse

| Need | Existing code |
| --- | --- |
| Root resolution, payload composition, and notification handling | `rootOf` and `payloadFrom` in `src/plugins/roles/activate.ts:54-64`; `TabPluginActivation.notify` in `src/plugins/api.ts:402-418`; the notification requirement in `src/plugins/activate.ts:63-70` |
| Role file and catalog APIs | `readRolesFile`/`writeRolesFile` in `src/plugins/roles/roles-file.ts:149,188`; `harnessLaunchCatalog` in `src/plugins/context.ts:176` builds enabled lists through `managers.models.modelsFor` |
| Roles payload guard and schema | `RoleEntry` and `isRolesPayload` in `src/plugins/roles/shared.ts:5,121`; the roles literal in `web/src/plugins/registry.tsx:99` |
| Current catalog column and drags | `RolesTab` in `web/src/plugins/roles/RolesTab.tsx:20`, `RolesDrag`/`dropOnCatalog` in `web/src/plugins/roles/roles-dnd.ts:10,92`, and catalog rules in `web/src/plugins/roles/roles.css:1-22` |
| Existing role cards and tests | `RoleCard` in `web/src/plugins/roles/RoleCard.tsx:25`; server/shared tests in `src/plugins/roles/activate.test.ts` and `shared.test.ts`; client/drop tests in `web/src/plugins/roles/RolesTab.test.tsx` and `roles-dnd.test.tsx` |

## Proposed changes

1. Add `notifications: ['models']` to `rolesManifest` in `src/plugins/roles/manifest.ts` and implement `notify` in `activate()` in `src/plugins/roles/activate.ts`. Handle the declared `models` notification only. Capture the resolved root synchronously in the command and every intent before queued work starts; use that root for the action, and use the most recently captured root on a later `models` notification, which has no origin. On each delivered `models` event, re-read the roles file and call `harnessLaunchCatalog()` again before publishing the roles payload. Deferred publication must not reset the remembered root: it tracks the most recently invoked command/intent, not the last queued operation to finish.
2. In `payloadFrom`, make copies of roles and entries and set `missing: true` only when `catalog.models` does not have the entry's harness as an own key or that enabled list does not include the entry's model. Do not add `missing: false`, mutate the decoded roles, or write the marker to `roles.json`; model notifications only republish the view. Keep the `catalog` in the payload for the enabled-model EntryPicker.
3. Set `ROLES_PAYLOAD_SCHEMA_VERSION` in `src/plugins/roles/shared.ts` to 2, add optional boolean `missing` to `RoleEntry`, and have `isRolesPayload` accept it when absent or boolean and reject other values. Keep `decodeEntry` in `src/plugins/roles/roles-file.ts` returning only stored harness/model/effort fields, so payload markers never become file data. Set the roles schema literal in `web/src/plugins/registry.tsx` to 2.
4. Remove the catalog column from `RolesTab.tsx` and its catalog drag-over/drop handlers. Remove `dragCatalogModel`, `dropOnCatalog`, and the `catalog` member from `RolesDrag` in `roles-dnd.ts`; delete only the catalog layout and drag selectors from `roles.css`. Preserve role and entry reordering and keep `EntryPicker` backed by the enabled `catalog.models` list.
5. In `RoleCard.tsx`, render an entry with `missing === true` dimmed and `title="Not in the model catalog"`, without adding visible text. Update `src/plugins/roles/activate.test.ts` to cover available, hidden, disabled, and absent models; payload derivation without modifying the roles file; each `models` delivery republishing the latest catalog and remembered root; and roots changed by later commands and intents. Update `src/plugins/roles/shared.test.ts` for optional/malformed `missing`, `web/src/plugins/roles/RolesTab.test.tsx` for the role-only layout and missing tooltip/dimming, and `web/src/plugins/roles/roles-dnd.test.tsx` for removing catalog drag/drop while preserving role/entry reordering. Update `web/src/plugins/registry.test.tsx` for the roles schema literal and the activation tests for the required `notify` callback.
6. Update `product/specs/roles.md` to describe the role-only layout, enabled-model picker, missing-entry marker and tooltip, and republishing on every models topic delivery without changing `roles.json`.

## Tests and verification

Run `$janissary/scripts/run.mjs check-diff` after each implementation change. Manually verify that a disabled or removed model stays in `roles.json`, appears dimmed with the tooltip on its role card, and is absent from the enabled-model picker; verify that a models notification refreshes the marker from the last command/intent root without writing the roles file.

## Out of scope

- Changing the `roles.json` shape or deleting role entries when a model is disabled or dropped.
- Dragging models from the models tab into roles, changing role/entry reorder behavior, or adding a restore workflow.
- Changes to the model catalog service or models table.
