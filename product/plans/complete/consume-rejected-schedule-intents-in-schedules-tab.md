# Consume rejected pause, resume, and cancel intents in the Schedules tab

**Complexity: 2/10** — one production file, ~2 added lines, eight behavioral requirements, two failure scenarios (p=4.0688)

## Goal

Pressing the Pause/Resume icon in the Schedules tab fires an intent and discards its promise. When the store save fails, the server rejects the request and the client turns the failed result into a thrown `Error`, which escapes as an unhandled browser rejection (`[pageerror] could not save system schedules`) even though the row is already left correctly unchanged. Route the tab's pause and resume intents through the repository's `fireIntent` helper so the rejection is consumed as a console warning, and apply the same handling to the delete confirmation. The change is client-only and leaves the silent-failure contract intact.

## Requirements

1. Pressing Pause on an active recurring system row sends a `pause` intent carrying `{ tab, owner: 'system', key, id }` (Proposal: "fire the tab's pause and resume intents through `fireIntent`").
2. Pressing Resume on a paused recurring system row sends a `resume` intent carrying the same identity fields (Proposal: "fire the tab's pause and resume intents through `fireIntent`").
3. A rejected `pause` intent does not become an unhandled rejection (Proposal: "so a domain rejection is consumed rather than escaping as an unhandled rejection").
4. A rejected `resume` intent does not become an unhandled rejection (Proposal: "so a domain rejection is consumed rather than escaping as an unhandled rejection").
5. A failed pause or resume leaves the row's icon and Next Run unchanged (feature text: "A Pause or Resume that fails to save leaves the row as it was, with its icon and Next Run unchanged").
6. A failed pause or resume shows no toast or other visible message (feature text: "and shows nothing else"; Proposal: "only a warning remains in the console").
7. Confirming Delete fires the `cancel` intent through the same consumed path (Proposal: "apply the same handling to `confirmDelete`").
8. A rejected `cancel` intent does not become an unhandled rejection (Proposal: "apply the same handling to `confirmDelete`").

## Design decisions

- Reuse `fireIntent` from `web/src/plugins/fire-intent.ts`, already published through `web/src/plugins/api.ts`, instead of adding a new wrapper: it awaits the intent and converts a rejection into `console.warn` with the intent name.
- Keep the fix client-only. The server already rejects a failed save (`capabilities.rejectRequest(error)`) and the tab already holds no optimistic row state, so no server, store, or payload change is needed.
- Apply the same consumed path to `confirmDelete` so all three row-changing intents (`pause`, `resume`, `cancel`) share one rejection contract.
- Keep the component thin: the rejection-consuming logic lives in the already-tested `fireIntent` helper, which is a shared plugin utility. `SchedulesTab` only forwards intents, so no new hook, service, or local module is warranted for two call sites.

## Preserved behavior

1. A single Pause click sends exactly one `pause` intent and focuses the list. It must not send a second intent or focus the owning tab. Pinned by `web/src/plugins/schedules/SchedulesTab.test.tsx` › `sends one pause intent on press, leaving the selection and the delete dialog alone`.
2. A paused row's control sends `resume`. It must not send `pause` for that row. Pinned by `web/src/plugins/schedules/SchedulesTab.test.tsx` › `sends the resume intent when the row is paused`.
3. A double click on the Pause control counts as one press. It must not toggle twice or focus the owner. Pinned by `web/src/plugins/schedules/SchedulesTab.test.tsx` › `counts a double-click on the control as one press without focusing the owner`.
4. Confirming Delete sends `cancel` with the row identity. It must not send the intent before confirmation. Pinned by `web/src/plugins/schedules/SchedulesTab.test.tsx` › `asks before deleting only the schedule in the row whose icon was pressed`.
5. Space and `p` toggle only a selected recurring system row. They must not toggle an unselected or non-recurring row. Pinned by `web/src/plugins/schedules/SchedulesTab.test.tsx` › `toggles only a selected recurring system row with Space and p`.
6. The control is offered only on recurring system rows in both layouts. It must not appear on one-shot or tab-owned rows. Pinned by `web/src/plugins/schedules/SchedulesTab.test.tsx` › `offers the control only on recurring system rows, in both layouts`.

## Assumptions

1. `fireIntent` awaits the intent and converts a rejection to a warning: `web/src/plugins/fire-intent.ts:9-13` `try { await capabilities.intent(name, payload); } catch (error: unknown) { console.warn(...) }`.
2. `fireIntent` is published for plugin tabs: `web/src/plugins/api.ts:364` `export { fireIntent } from './fire-intent';`.
3. The client turns a rejected result into a thrown error: `web/src/plugins/plugin-client-capabilities.ts:60` `if (!result.ok) throw new Error(result.error ?? \`Plugin intent "${name}" failed\`);`.
4. The server rejects a failed schedule save: `src/plugins/schedules/activate.ts:85` `if (error) capabilities.rejectRequest(error);` for both `pause` and `resume`.
5. The tab holds no optimistic row state: `web/src/plugins/schedules/SchedulesTab.tsx:65-71` `togglePause` only sends an intent and focuses the container; rows come from `payload.entries` at line 27.
6. `intent` is promise-returning: `web/src/plugins/api.ts:224` `intent<Result>(name: string, payload: unknown): Promise<Result>;`.

## Existing functionality

1. `fireIntent` already awaits an intent and consumes a rejection with a warning: `web/src/plugins/fire-intent.ts:16` `export function fireIntent(...)`.
2. It is already re-exported for plugin tab bodies: `web/src/plugins/api.ts:364` `export { fireIntent } from './fire-intent';`.
3. Other plugin tabs already send intents through it: `web/src/plugins/audio/AudioTab.tsx:23` `fireIntent(capabilities, name, payload);`.
4. Its rejection behavior is already unit-tested: `web/src/plugins/fire-intent.test.ts:16` `reports a rejection with the intent name without throwing`.

## Implementation steps

1. **Route the three Schedules tab intents through `fireIntent`.** In `web/src/plugins/schedules/SchedulesTab.tsx`, add `fireIntent` to the existing import from `../api` (line 4). Replace the `void capabilities.intent(...)` call in `togglePause` (lines 67-69) with a `fireIntent(capabilities, name, payload)` call using the same intent name and `{ tab, owner: 'system', key, id }` payload, and replace the `void capabilities.intent('cancel', ...)` call in `confirmDelete` (line 60) the same way. Keep `containerRef.current?.focus()`, the `pendingDelete` reset, and every identity shape exactly as they are. No new module is introduced; the file is 161 lines, well under the 200-line limit. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The Pause/Resume icon, Delete confirmation, selection, dock layouts, and key bindings are unchanged. On a failed save the row keeps its current icon and Next Run exactly as it does today; the only new outcome is a console warning instead of an unhandled browser error, with no added toast or visible message.

## Tests

1. Add a colocated regression case in `web/src/plugins/schedules/SchedulesTab.test.tsx` under `describe('SchedulesTab pause and resume')` for requirements 3-6: build capabilities whose `intent` rejects with `Error('could not save system schedules')`, spy on `console.warn`, click the Pause icon on an active recurring system row and the Resume icon on a paused one, then assert the intent was sent with the correct identity, the rendered row text and its Pause/Resume control are unchanged, a warning was emitted, and no unhandled rejection escapes (Vitest fails the run on an unhandled rejection). Restore the console spy afterwards.
2. The existing cases in that file already pin requirements 1, 2, 7 and the preserved-behavior list; they must keep passing unchanged. `web/src/plugins/fire-intent.test.ts` already covers the helper itself and is not modified.

## Out of scope

- No change to the server-side `pause`, `resume`, or `cancel` intents, the schedule store, or the aggregated payload.
- No optimistic row update and no new error UI, toast, or message in the tab.
- No change to `fireIntent` or its tests.
- No `product/specs/`, `help/`, or `documentation/` edits.
- No pull request description change, including the `### Additional test cases` section.

## Verification

1. `$janissary/scripts/run.mjs check-diff`.
2. From a scratch project with a recurring system schedule, open the Schedules tab, make `.janissary/` unwritable with `chmod 555 .janissary`, press `Pause schedule ping`, then restore the mode. The row's icon and Next Run stay as they were, no `[pageerror]` appears in the browser console, and the only console output is a warning of the form `Plugin intent "pause" failed: could not save system schedules`. Repeat with a paused row's Resume control and with a Delete confirmation: each rejected intent is warned once and the row is unchanged.
