# Remove the model catalog from Roles

**Complexity: 4/10** — the work removes one UI column and its drag paths while adding a server-derived missing marker to a versioned roles payload.

## Goal

Make the roles tab edit roles only. Remove catalog drags and show role entries that are unavailable in the effective catalog as dimmed rows with the exact tooltip.

## Decisions and dependencies

- Depends on `models-host-topic.md` and `models-catalog-consumers.md`, so the roles plugin can subscribe to catalog changes and use the effective launch catalog.
- `roles.json` is unchanged by Delete or Refresh. An unavailable role entry remains on its card; the server marks it `missing` when no effective catalog model exists for its harness.
- The roles plugin remembers the last root resolved by its command or intent and uses that root when the models notification arrives, because notifications have no originating tab.
- Bump the roles payload schema from 1 to 2; keep the `missing` field optional and boolean in the guard so existing valid payload fields remain accepted.

## Existing code to reuse

| Need | Existing code |
| --- | --- |
| Role file composition and catalog | `src/plugins/roles/activate.ts` and `src/plugins/context.ts` |
| Roles payload guard and schema | `src/plugins/roles/shared.ts` and `web/src/plugins/registry.tsx` |
| Current catalog column and drags | `web/src/plugins/roles/RolesTab.tsx`, `roles-dnd.ts`, and `roles.css` |
| Existing role cards and tests | `web/src/plugins/roles/RoleCard.tsx`, `RolesTab.test.tsx`, and `roles-dnd.test.tsx` |

## Proposed changes

1. Add `notifications: ['models']` to the roles manifest. In `src/plugins/roles/activate.ts`, republish from the roles file and `harnessLaunchCatalog()` when the topic changes, using the remembered root. Mark entries `missing` when their harness/model pair is absent from the catalog.
2. Set `ROLES_PAYLOAD_SCHEMA_VERSION` to 2, accept the optional boolean `missing` in `isRolesPayload`, and set the roles literal in `web/src/plugins/registry.tsx` to 2. Keep the entry picker backed by enabled `catalog.models`.
3. Remove the catalog column and its drop handling from `RolesTab.tsx`. Remove `dragCatalogModel`, `dropOnCatalog`, and the catalog drag kind from `roles-dnd.ts`; remove the corresponding catalog rules from `roles.css`. Preserve role and entry reordering.
4. Render a missing entry dimmed with `title="Not in the model catalog"` and no visible text addition in `RoleCard.tsx`.
5. Update server and shared tests for the missing marker, schema-2 guard, and republish on a models delivery using the remembered root. Update `RolesTab.test.tsx` and `roles-dnd.test.tsx` for the removed column/drags and add the dimmed-entry case. Update `web/src/plugins/registry.test.tsx` for the plugin schema literal.
6. Update `product/specs/roles.md` to describe the role-only layout, enabled-model picker, missing-entry marker, and catalog-change republishing.

## Tests and verification

Run `$janissary/scripts/run.mjs check-diff` after each implementation change. Verify a missing entry remains in `roles.json` and on its card, while the picker excludes disabled models.

## Out of scope

- Changing the `roles.json` shape or deleting role entries when a model is disabled or dropped.
- Dragging models from the models tab into roles, changing role/entry reorder behavior, or adding a restore workflow.
- Changes to the model catalog service or models table.
