# System schedules 11: aggregate schedules and plugin owner actions

**Complexity: 6/10**

This coordinates one shared row/action contract with duplicate-key identity, persistence outcomes and lazy full/docked plugin views. The owner and command paths are already delivered; dialog work is separate.

## Goal

Show project schedules alongside tab schedules and make delete, focus and clear-all act on the correct owner through the published plugin capabilities. Source: `product/plans/ready/add-system-schedules.md`.

## Decisions and dependencies

- Dependencies: 01 and 03 (reveal), 04 and 08 (unique system keys and synchronous persisted mutation outcomes), 09 (user-created entries). 10 is already delivered in filename order but is not required by the aggregate contract.
- Extend aggregate rows with an additive owner discriminator: absent/`tab` means the existing tab-owned row; `system` means a project-owned row and requires its immutable `key`. Keep `id` as the display/user schedule name and `tab: 'system'` as the focus/attribution label. Display command is `script <name>`. Two system rows with the same `id` remain separate by key, including when a tab timer `in system` has that same id.
- Merge and sort by raw `nextRun`, with stable tie order, before formatting; formatted `next` text is not a sort key. Project rows do not depend on a currently open system tab and never enter `ScheduleManager.view(label)` or the shell's per-tab status window.
- Extend schedule topic actions additively with system owner/key variants. Keep legacy cancel `{ tab, id }` and focusOwner `{ tab }` semantics limited to actual tab-owned rows. System cancellation uses one key, while command cancel-by-name in 09 removes all name matches. Validate against current authoritative owner rows; stale/malformed/forged owner/key requests must not cancel another row or become focus-any-tab grants.
- `ScheduleManager.clearAll` clears both owners and emits refreshes through existing schedules/state signals. It deletes no scripts. Use 08's synchronous mutation outcomes to preserve the existing boolean `clearAll` and void `topicAction` contracts: persist the system clear before clearing tab entries, and convert store failure to a `TabPluginRejection` at the guarded request boundary. Leave both visible sets unchanged on persistence failure. Do not throw an ordinary plugin-failure exception or report a fake successful empty UI.
- Additive topic row/action variants preserve API v2 and existing tab shapes. Keep old action variants working, no removal/deprecation needed. Increment the schedules plugin payload schema for the new owner-aware client envelope; update manifest, lazy registry literal and guard/schema tests together. Frozen v1 implementations are untouched.

## Existing code to reuse

`ScheduleManager.aggregatedView/clearAll`, `src/schedule/views.ts`, `src/protocol/schedule.ts`, `src/plugins/{api-topics,context,topics}.ts`, `src/plugins/schedules/{activate,shared}.ts`, and `web/src/plugins/schedules/{SchedulesTab,DeleteScheduleDialog}.tsx`. Use the declared `topicData`/`topicAction` capabilities, never `Managers` inside the concrete plugin or raw RPC from its client.

## File scope

- `src/schedule/{manager,views}.ts`, `src/protocol/schedule.ts`, `src/protocol.ts` if a new shared named wire type needs export; new `src/schedule/aggregate.ts` if merged view extraction is needed; `src/plugins/{api-topics,topics,context}.ts`, anticipated `src/plugins/schedule-topic.ts` extraction from topics; `src/plugins/schedules/{activate,shared,manifest}.ts`.
- `web/src/plugins/schedules/{SchedulesTab,DeleteScheduleDialog}.tsx`, new `web/src/plugins/schedules/schedule-row-identity.ts`; `web/src/plugins/registry.tsx`. Extract full/compact row components only if growth requires it; keep them inside the schedules feature.
- Tests: existing `src/schedule/manager.test.ts`, `src/plugins/{api-topics,topics,notifications,context}.test.ts`, `src/plugins/schedules/{activate,shared}.test.ts`, `web/src/plugins/schedules/{SchedulesTab,DeleteScheduleDialog}.test.tsx`, `web/src/plugins/schedules/schedules-keys.test.ts`, `web/src/plugins/registry.test.tsx`, and frozen compatibility tests named in 05. New `src/schedule/views.test.ts`, row-identity/aggregate tests if extracted, and `src/plugins/schedules/owner-actions.integration.test.ts`. Existing `web/src/shared/status-windows/{StatusPanels.test.tsx,useStatusWindows.test.ts}` gain an exclusion regression fixture only.
- Specs/docs: `product/specs/{scheduling,tab-plugins}.md`, `documentation/developer-documentation/tab-plugins.md` reference/additive changelog, `documentation/user-documentation/automation/scheduling.md`.

## Ordered changes

1. Add optional-owner/tab and keyed-system row variants in the shared wire contract. Merge raw entries and sort once; keep per-tab projection isolated.
2. Extend public topic action variants/host handling and current-row authorization. Wire owner single-key delete and focus to the common reveal seam, and clear-all to both owners.
3. Map owner/key through plugin activation, import-safe shared guards, intents, schema and lazy registry. Preserve existing capabilities and budget/failure boundaries.
4. Update full/docked client rows, keys and pending-delete identity. Do not key system rows by `tab:id`, which collides on repeated names. Keep selection, Delete confirmation, keyboard navigation and clear-button behavior.
5. Update specs/reference and run aggregate/compatibility/chunk checks.

## Tests and verification

Test mixed sorting, equal timestamps, duplicate system ids, a tab timer owned by system alongside a project row, no current shell after failed startup, live refresh after firing/cancel/clear, exactly-one-key deletion, command-name cancellation distinction, stale rows, forged keys/owner/tab mismatches, malformed intents, old tab action compatibility, focus reveal, clear-all persistence and script retention, full/docked keyboard/double-click actions, and no system rows in per-tab windows.

Run `./scripts/run.mjs check-diff`, `npm run build:web`, inspect the lazy schedules chunk, and run the frozen compatibility tests if related-test selection omits them. Scope E2E opens the actual schedules plugin in a connected scratch server, creates mixed/duplicate-name rows via commands, deletes one duplicate through its actual intent, follows a system focus action to reveal, docks the list and repeats, then clears all and relaunches to confirm no schedule returns while script files remain. 13 adds the final cross-feature browser matrix.

## Boundaries

No dialog changes, row editing, generic focus-anything capability, or per-tab window redesign. Keep payload guards and schema literals aligned and never statically import concrete activation/client entries into the host.
