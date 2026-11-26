# Carry paused state over the wire and add pause/resume plugin actions

**Complexity: 5/10** — ~70 added lines across 7 files, 9 scenarios, 7 new units (p=5.564)

## Goal

Make the Schedules plugin aware of paused system rows and able to pause or resume one. Today the aggregated view and the plugin's import-free row copy carry no pause state, the plugin declares only clear/cancel/focus-owner intents, and the topic actions know only cancel/clear/focusOwner. This change adds the optional paused flag to both row shapes, raises the plugin payload schema, adds the two intents and their topic actions, and authorizes them against the current aggregated view exactly as cancel is. No rendered control is added here; the tab sends these intents in the next subplan.

Source: `./product/plans/complete/pause-recurring-system-schedules.md`. Depends on `pause-recurring-system-schedules-1-store-v2-format.md` for the paused field and `pause-recurring-system-schedules-3-pause-resume-mutations-manager.md` for `pauseByKey` and `resumeByKey`.

## Requirements

1. "Pausing or resuming posts nothing to the notifications feed, from either the Schedules tab or the command" (user answer: "No notice"). This subplan covers the tab path: the two topic actions return only a save error, never a notice.
2. "Each active recurring system row offers a Pause control, which pauses only that row by key" — the server half: the `pause` intent and topic action that act by key. The rendered control lands in `pause-recurring-system-schedules-8-schedules-tab-ui.md`; this requirement is shared between the two subplans.
3. "Each paused system row offers a Resume control, which resumes only that row by key" — the server half: the `resume` intent and topic action that act by key. Shared with `pause-recurring-system-schedules-8-schedules-tab-ui.md`.
4. "A pause or resume from the tab that fails to save leaves the row as it was" (user answer: "Silent, like Delete"). This subplan delivers the failed save as a topic-action error; the client's no-local-change behavior lands in `pause-recurring-system-schedules-8-schedules-tab-ui.md`. Shared.
5. "A `pause` or `resume` intent naming a key that is not a recurring system row in the current view is refused and changes nothing" (precedent: the `cancel` topic action is authorized against the current aggregated view). This subplan performs the authorization; the client's unchanged rendering lands in `pause-recurring-system-schedules-8-schedules-tab-ui.md`. Shared.

## Design decisions

- Add an optional `paused: true` to the system branch of `AggregatedScheduleView` in `src/protocol/schedule.ts` and to the system branch of the plugin's import-free `ScheduleRow` in `src/plugins/schedules/shared.ts`. The existing shape-pin test must still compile with both shapes.
- `aggregatedScheduleView` in `src/schedule/views.ts` copies the flag onto a system row and sets the row's `next` text to `paused`, so the client renders server-computed text. Rows still sort by the raw stored `nextRun`, so a paused row keeps its position among active rows.
- Raise `SCHEDULES_PAYLOAD_SCHEMA_VERSION` from 2 to 3 and the literal `clientPlugin(2, ...)` for `schedules` in `web/src/plugins/registry.tsx` together, so the wire envelope and the host check agree. `src/plugins/schedules/manifest.ts:14` reads the constant, and `web/src/plugins/registry.test.tsx:43` compares the registry literal to the imported constant, so changing both in one step keeps that test green without a separate edit. Do not change any other plugin's version.
- Add one guard, `isSystemRowIntent`, to `src/plugins/schedules/shared.ts`. It accepts only `{ tab: 'system', owner: 'system', id, key }`, and both new intents use it because they carry the same payload. Extend `isScheduleRow` to accept `paused` only on a system row.
- Add `pause` and `resume` actions to the `schedules` topic union in `src/plugins/api-topics.ts`, mirroring the system `cancel` action's identity fields.
- In `src/plugins/schedule-topic-actions.ts`, authorize each action against a recurring system row with the given key and id in the current aggregated view, then call `pauseByKey` or `resumeByKey`, returning the save error when it fails. A refused authorization returns `undefined` and changes nothing.
- In `src/plugins/schedules/activate.ts`, add `pause` and `resume` to the intent table, carrying a save error to `rejectRequest` exactly as `cancel` does, and copy `paused` in `toPayload`.

## Preserved behavior

1. Schedules tab intents keep mapping to their topic actions. Adding `pause` and `resume` must not change what `cancel`, `clear`, or `focus-owner` send. Pinned by `src/plugins/schedules/activate.test.ts` › `turns each intent into the topic action it names`.

## Assumptions

1. The aggregated view orders all rows by raw `nextRun`: `src/schedule/views.ts:33` `.toSorted((a, b) => a.entry.nextRun - b.entry.nextRun)`.
2. The client registry pins the schedules plugin's schema version as a literal: `web/src/plugins/registry.tsx:104` `schedules: clientPlugin(2, clientPluginLoaders.schedules),`.
3. The plugin's schema version lives in one import-free constant: `src/plugins/schedules/shared.ts:1` `export const SCHEDULES_PAYLOAD_SCHEMA_VERSION = 2;`.
4. The topic action union carries a system-row action addressed by key: `src/plugins/api-topics.ts:106` `| { topic: 'schedules'; action: 'cancel'; tab: 'system'; id: string; owner: 'system'; key: string }`.
5. A system-row cancel is authorized against the current aggregated view and applied by key: `src/plugins/schedule-topic-actions.ts:35` `function cancelSystemSchedule(managers: Managers, key: string, id: string): string | undefined {`.
6. The Schedules plugin declares its row intents in one table: `src/plugins/schedules/activate.ts:58` `intent: defineIntents('schedules', isSchedulesPayload, {`.
7. System-row topic action authorization is already tested with a live key and a stale one: `src/plugins/topics.test.ts:415` `topic: 'schedules', action: 'cancel', tab: 'system', id: 'build', owner: 'system', key: 'stale',`.
8. The plugin row shape is re-declared and pinned against the wire shape: `src/plugins/schedules/shared.test.ts:16` `const asWireRow: AggregatedScheduleView = ROW;`.

## Existing functionality

1. `aggregatedScheduleView` shapes every row from one place: `src/schedule/views.ts:20` `export function aggregatedScheduleView(`.
2. The plugin's `toPayload` copies system identity and key: `src/plugins/schedules/activate.ts:27` `function toPayload(rows: readonly AggregatedScheduleView[]): SchedulesPayload {`.
3. `defineIntents` is the single registration point for plugin intents: `src/plugins/schedules/activate.ts:58` `intent: defineIntents('schedules', isSchedulesPayload, {`.
4. `rejectRequest` is the existing error path for a refused intent: `src/plugins/schedules/activate.ts:63` `if (error) capabilities.rejectRequest(error);`.
5. `scheduleTopicAction` is the single dispatcher for `schedules` topic actions: `src/plugins/schedule-topic-actions.ts:6` `export function scheduleTopicAction(managers: Managers, action: TabPluginTopicAction): string | undefined {`.

## Implementation steps

Each step ends green under `$janissary/scripts/run.mjs check-diff`.

1. Add `paused?: true` to the system branch of `AggregatedScheduleView` in `src/protocol/schedule.ts` and to the system branch of `ScheduleRow` in `src/plugins/schedules/shared.ts`. Keep both shapes' non-system branches unchanged so the shape-pin test still compiles.
2. In `src/schedule/views.ts`, have `aggregatedScheduleView` copy `paused` onto a system row and set its `next` to the literal `paused` when the entry is paused. Do not change the sort key or any tab row.
3. In `src/plugins/schedules/shared.ts`, add `isSystemRowIntent` accepting only the system identity `{ tab: 'system', owner: 'system', id, key }`, extend `isScheduleRow` to allow `paused` only on a system row, raise `SCHEDULES_PAYLOAD_SCHEMA_VERSION` to 3, and update the matching literal in `web/src/plugins/registry.tsx` to `clientPlugin(3, ...)` in the same step. The manifest takes the version from the constant, so no manifest edit is needed.
4. Add the `pause` and `resume` actions to the `schedules` union in `src/plugins/api-topics.ts`, beside the system `cancel` action, carrying `tab: 'system'`, `owner: 'system'`, `id`, and `key`.
5. In `src/plugins/schedule-topic-actions.ts`, add cases that authorize each action against a recurring system row with the matching key and id in the current aggregated view, then call `pauseByKey` or `resumeByKey`, returning the error on a failed save. A stale key or a one-shot row's key returns `undefined` without calling the owner.
6. In `src/plugins/schedules/activate.ts`, add `pause` and `resume` intents using `isSystemRowIntent`, dispatch their topic actions, pass any error to `rejectRequest`, and copy `paused` in `toPayload`.
7. Add tests: `src/schedule/views.test.ts` for a paused row carrying `paused: true` and `next: 'paused'` and keeping its stored-time position; `src/plugins/schedules/shared.test.ts` for the shape pin, `paused` only on system rows, and `isSystemRowIntent` accepting only the system identity; `src/plugins/schedules/activate.test.ts` for the two intents mapping to their topic actions and a save error becoming a rejection; `src/plugins/topics.test.ts` for pause and resume by a known key changing the row, a stale key or a one-shot key changing nothing, and a save error returning through `topicAction`. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None found. This subplan changes wire shapes, guards, and topic actions only. The rendered Pause/Resume control is added in `pause-recurring-system-schedules-8-schedules-tab-ui.md`.

## Tests

- `src/schedule/views.test.ts`: a paused system row carries `paused: true` and `next: 'paused'` and keeps its stored-time position (Requirement 2 and 3 server half).
- `src/plugins/schedules/shared.test.ts`: the shape pin still matches, `paused` is accepted only on system rows, and `isSystemRowIntent` accepts only the system identity (Requirements 2 to 5).
- `src/plugins/schedules/activate.test.ts`: `pause` and `resume` intents turn into their topic actions and a save error becomes a rejection (Requirements 2 to 4; Preserved behavior 1).
- `src/plugins/topics.test.ts`: pause and resume by a known key change the row, a stale key or a one-shot key changes nothing, and a save error comes back through `topicAction` (Requirements 4 and 5).

## Out of scope

- No rendered icon, key binding, or CSS; those land in `pause-recurring-system-schedules-8-schedules-tab-ui.md`.
- No change to the `cancel`, `clear`, or `focus-owner` intents or topic actions.
- No notifications-feed entry for pause or resume.
- No schema change for any plugin other than `schedules`.

## Verification

1. `$janissary/scripts/run.mjs check-diff`.
2. Concrete end-to-end check in the running app: pause a system schedule with `schedule system pause ping`, open the `schedules` tab, and confirm the row's Next Run cell reads `paused` while its position among rows is unchanged. Confirm no notifications-feed entry was added. Read `src/plugins/schedules/shared.ts` and `web/src/plugins/registry.tsx` and confirm both carry schema version 3, and read `src/plugins/schedule-topic-actions.ts` to confirm a stale key is refused before any owner call.
