# System schedules 14: aggregate schedules and plugin owner actions

**Complexity: 6/10**

This connects project-owned schedules to the existing aggregate tab through one owner-aware row/action contract. The system owner and command paths are already delivered; dialog work is separate.

## Goal

Show project schedules alongside tab schedules and make delete, focus and clear-all act on the correct owner through the published plugin capabilities. Source: `product/plans/ready/add-system-schedules.md`.

## Decisions and dependencies

- Dependencies: plans 01, 03, and 04 (reveal, managed shell, recovery), 07 (system entry types), 11 (synchronous persisted mutation outcomes), and 12 (user-created entries). Plan 13's execute/edit additions are not required by this aggregate; plans 05 and 06 remain independent. Do not expand this plan into their scope.
- Add an optional owner discriminator to the shared aggregate row: absent or `tab` remains the existing tab-owned shape; `system` denotes a project-owned row and requires its immutable `key`. Keep `id` as the display/name field and `tab: 'system'` as the focus/attribution label. Render the command as `script <name>`. Two system rows may share an `id`, and a tab timer targeted `in system` may share that name too; those rows remain distinct by owner and system key.
- Merge tab and system rows and sort by raw `nextRun` before formatting, preserving source order for equal timestamps. Never sort formatted `next` text. Project rows are independent of whether the managed system tab currently exists and must never enter `ScheduleManager.view(label)` or the per-tab schedule status window.
- Add schedule topic actions for keyed system cancellation while keeping `{ tab, id }` cancellation and `{ tab }` focus-owner behavior limited to rows owned by tabs. Keyed UI cancellation removes one system entry; the existing command's cancel-by-name behavior remains “remove every matching name.” Authorize each action against the current aggregate and current owner state, not stale client data. A forged or stale key, mismatched owner, or system row without a current managed shell must not cancel another entry or grant focus to an arbitrary tab. Focusing a system row must call `managers.systemShell.ensure()` and activate the returned system-shell tab, covering first creation and recovery rather than trusting the row's `tab: 'system'` label.
- Make clear-all atomic across the two owners: persist the system owner's empty snapshot first, and only after success clear tab schedules and their hooks. Preserve `ScheduleManager.clearAll()`'s boolean result. Since `topicAction()` currently returns `void`, extend it additively to return `string | undefined`: the schedules action returns the `SystemScheduleResult.error` for failed keyed cancel or clear, while successful and existing non-schedules actions return `undefined`. Existing callers may ignore the result. The schedules intent turns a returned error into `rejectRequest`, so a storage failure cannot be mistaken for success. Keep tab-owned cancel behavior unchanged. Successful clear removes schedules only, never runscript files.
- Keep additions compatible with plugin API v2 and existing tab actions. Increment `SCHEDULES_PAYLOAD_SCHEMA_VERSION` for the owner/key payload change, then update the manifest-derived envelope, literal client registry schema, lazy registry tests, and import-free shared guards together. Leave the frozen v1 fixture untouched.

## Existing code to reuse

`ScheduleManager.aggregatedView/clearAll`, `SystemScheduleManager.list/cancelByKey/clear` in `src/schedule/system/manager.ts`, `src/schedule/views.ts`, `src/protocol/schedule.ts`, and the existing managed-system-shell reveal method. The plugin path is `src/plugins/{api-topics,context,topics}.ts` plus `src/plugins/schedules/{activate,shared}.ts`; the client is `web/src/plugins/schedules/{SchedulesTab,DeleteScheduleDialog}.tsx`. The current shared action path is `src/plugins/topics.ts`; extract schedule action handling only if its 200-line source limit requires it. Use declared `topicData`/`topicAction` capabilities, never `Managers` in the concrete plugin or raw RPC from its client.

## File scope

- `src/schedule/{manager,views}.ts`, `src/schedule/system/{manager,manager.test}.ts`, `src/protocol/schedule.ts`, and the actual managed-system-shell reveal owner. Extract merged aggregation into `src/schedule/aggregate.ts` only if it keeps existing modules within the file limit. Extend `src/plugins/{api-topics,context,topics}.ts` and `src/plugins/schedules/{activate,shared,manifest}.ts`; extract schedule actions from `topics.ts` only if needed to stay within 200 lines.
- `web/src/plugins/schedules/{SchedulesTab,DeleteScheduleDialog}.tsx`, `web/src/plugins/schedules/schedules-keys.ts`, and `web/src/plugins/registry.tsx`. Add a focused pure row-identity module only if row-key and pending-delete identity need a reusable seam; keep full and docked rendering on the same row/action contract.
- Tests: `src/schedule/{manager.test,views.test}.ts`, `src/schedule/system/manager.test.ts`, `src/plugins/{api-topics,topics,context}.test.ts`, `src/plugins/schedules/{activate,shared}.test.ts`, `web/src/plugins/schedules/{SchedulesTab,DeleteScheduleDialog}.test.tsx`, `web/src/plugins/schedules/schedules-keys.test.ts`, `web/src/plugins/registry.test.tsx`, and frozen compatibility tests from plan 08. Add focused integration coverage for action authorization and persistence-failure results. Extend status-window tests only if the affected projection path changes, to pin that system rows remain excluded.
- Update `product/specs/{scheduling,tab-plugins}.md` and `documentation/developer-documentation/tab-plugins.md` (topic action result contract and API changelog). Update `documentation/user-documentation/automation/scheduling.md` only for user-visible aggregate behavior.

## Ordered changes

1. Add owner/key to the aggregate wire shape and import-free schedules shared contract. Combine sorted tab rows with system rows using raw timestamps and a stable tie rule; keep per-tab schedule projection untouched.
2. Extend the schedules topic action union and its outcome path additively. Authorize system actions against current keys; persist keyed cancel/clear before publishing or mutating other owner state. Route system focus through the managed-shell reveal path.
3. Map owner and key through activation, intent guards, payload schema and the literal client registry entry. Keep the capability set, lazy loading, and plugin failure boundaries aligned with current contracts.
4. Update both full and docked rows to display system ownership and use a distinct stable identity for duplicate names. Carry that identity into pending delete; preserve existing tab cancel, keyboard navigation, selection, and clear behavior.
5. Update the behavior spec and plugin reference, then run focused tests, diff checks, and a production web build/chunk inspection.

## Tests and verification

Test mixed sorting and stable equal-time order; repeated system names and a tab timer whose label is `system`; aggregation when the managed shell is absent; refresh after firing, cancel, and clear; one-key deletion versus command cancel-by-name; stale and forged key/owner/tab combinations; malformed intents; existing tab-action compatibility; managed-shell reveal; clear persistence failure leaving both owners unchanged; successful clear retaining script files; full/docked keyboard, selection, confirm/cancel, and focus actions; and exclusion from per-tab status windows.

Run `./scripts/run.mjs check-diff`, `npm run build:web`, inspect that the schedules client remains in its lazy chunk, and run frozen compatibility tests if related-test selection omits them. A focused browser scenario opens the actual schedules plugin, creates mixed and duplicate-name rows through commands, deletes one duplicate through its intent, focuses a system row to reveal the managed shell, repeats in docked mode, then clears all and relaunches to confirm schedules do not return while scripts remain. Plan 16 owns the broader cross-feature browser matrix.

## Boundaries

No dialog changes, row editing, generic focus-anything capability, parser changes from 12, execute/edit source changes from 13, or per-tab window redesign. Keep payload guards and schema literals aligned and never statically import concrete activation/client entries into the host. Complexity remains 6/10 if topic outcomes stay a small additive path; raise it or split the work if persistence error propagation requires broader plugin API redesign.
