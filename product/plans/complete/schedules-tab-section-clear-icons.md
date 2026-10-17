# Move the schedules tab's clear control into each section's header row

**Complexity: 6/10** — spans the topic-action type, the host topic handler, the plugin intent, the web header, the stylesheet, and the tests and specs that describe the one clear button. Every layer already has a `clear` path to copy, so the work is splitting one action into two owner-scoped actions. No new capability or storage. The one new idea is a trailing grid track, which the next backlog item (per-row action column) will reuse.

Today the schedules tab's metadata bar holds a single trash icon, labelled **Clear all schedules**, that removes every tab-owned and every project-owned schedule at once. Now that the list has a system section and a tab section, each with its own column-heading row (see `schedules-tab-system-section`), the trash icon moves into those header rows.

## Design decisions

- **Reading of the issue**: each section's header row carries a trash icon that clears that section's owner. The system section's icon clears project system schedules. The tab section's icon clears every tab-owned schedule across all open tabs. The metadata bar keeps the split action and loses the clear control.
- **Why not a single clear-all in the header row**: the issue says the icon belongs in each header row "rather than in the metadata bar". A single icon would have to sit in one header, which would be arbitrary. Owner-scoped clears map onto the two owners the list already separates.
- **Visibility**: a section's header row exists only when the section has rows (per the system-section plan), so its trash icon appears only when it has something to clear. The old disabled state is no longer needed and is removed.
- **Action shape**: one `clear` action gains a required `owner: 'system' | 'tab'`. The host routes `system` to `systemSchedule.clear()` (durable, can fail and is reported as a rejection) and `tab` to `schedule.clearAll()`. Each route touches only its own owner, so a failed system save never affects tab schedules, and clearing tabs never touches project schedules.
- **Intent payload**: the plugin's `clear` intent payload becomes `{ owner: 'system' | 'tab' }`, validated strictly (exactly one key, one of the two values). The old empty payload is rejected.
- **Trailing grid track**: the headings and rows grid gets a fixed trailing column (`1.5em`) in both layouts. Only the header row fills it, with the trash button, and rows leave it empty. Because each row is its own grid, a fixed width keeps the 1fr columns aligned between the header and the rows. An `auto` track would not align.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Reuse |
| --- | --- | --- |
| `clear` topic action and host handler | `src/plugins/api-topics.ts`, `src/plugins/schedule-topic-actions.ts` | Add `owner`, split the branch |
| Durable system clear with rejection on save failure | `managers.systemSchedule.clear()` in `src/plugins/schedule-topic-actions.ts` | Used unchanged for the system owner |
| Tab-wide clear | `ScheduleManager.clearAll()` in `src/schedule/manager.ts` | Used unchanged for the tab owner |
| Intent validation pattern | `isCancelIntent` / `isFocusOwnerIntent` in `src/plugins/schedules/shared.ts` | Add `isClearIntent` in the same style |
| Trash icon button styling | `.schedules-clear` in `web/src/plugins/schedules/schedules.css` | Reuse the class for the header-row icon |
| Section component | `web/src/plugins/schedules/SchedulesRows.tsx` (`ScheduleSection`) | Render the header trash icon inside it |

## Proposed changes

**Topic action type.** In `src/plugins/api-topics.ts`, replace `{ topic: 'schedules'; action: 'clear' }` with `{ topic: 'schedules'; action: 'clear'; owner: 'system' | 'tab' }`, with a short comment that each owner is cleared separately.

**Host handler.** In `src/plugins/schedule-topic-actions.ts`, the `clear` case branches on `action.owner`: `'tab'` calls `managers.schedule.clearAll()` and returns; `'system'` calls `managers.systemSchedule.clear()` and returns its error when it fails.

**Plugin intent.** In `src/plugins/schedules/shared.ts`, add `export type ClearIntent = { owner: 'system' | 'tab' }` and `isClearIntent`, which requires a record with exactly one key, `owner`, whose value is `'system'` or `'tab'`. Remove `isEmptyIntent` from this file, since nothing else uses it. In `src/plugins/schedules/activate.ts`, the `clear` intent uses `isClearIntent` and forwards `{ topic: 'schedules', action: 'clear', owner: payload.owner }`.

**Web — section header.** In `web/src/plugins/schedules/SchedulesRows.tsx`, `ScheduleSection` gains `owner: 'system' | 'tab'` and `onClear: () => void`. The headings row renders its existing column headings followed by a `<button type="button" className="schedules-clear">` containing the trash icon, with `aria-label` `Clear system schedules` for the system section and `Clear tab schedules` for the tab section. The icon uses the same `faTrash` import the tab used.

**Web — tab.** In `web/src/plugins/schedules/SchedulesTab.tsx`, remove the clear button from `.schedules-actions` and keep only `splitAction`. Pass `owner="system"` with `onClear={() => { void capabilities.intent('clear', { owner: 'system' }); }}` to the system section, and `owner="tab"` with `{ owner: 'tab' }` to the tab section.

**Stylesheet.** In `web/src/plugins/schedules/schedules.css`, add a trailing fixed track: full layout `grid-template-columns: 2em 1fr 1fr 1fr 1fr 2fr 1.5em;`, compact layout `1.5em 1fr 1fr 1fr 1.5em`. Give `.schedules-clear` `justify-self: center`, drop the `:disabled` rules that no longer apply, and keep the rest of its styling.

**Spec.** In `product/specs/scheduling.md`:
- Replace the sentence about the **Clear all schedules** button sitting in the docked header with one saying the section headers carry the clear controls.
- Replace "Clear all schedules removes both tab-owned and project-owned schedules." with the owner-scoped behavior: each section's trash icon clears only that owner, the system one refusing and leaving schedules unchanged when the empty system list cannot be saved, and the tab one clearing every tab-owned schedule across tabs.
- Replace the metadata-header sentence with: each section header carries a trash icon labelled for that section, shown only while the section has rows.

**User documentation.** In `documentation/user-documentation/automation/scheduling.md`, replace the sentence about the header's **Clear all schedules** button with the same owner-scoped description, in user language. Keep the rest of the paragraph.

**E2E script.** `scripts/e2e/system-schedules-management.mjs` clicks the removed button. Change it to click **Clear system schedules** and then **Clear tab schedules**, and wait for the aggregate rows to detach as it does now. The persisted-store and tab-list assertions stay as they are. This script is not run by `check-diff`; it needs the Playwright app and is noted as unverified in the report.

## Tests

- `src/plugins/schedules/activate.test.ts`: `clear` with `{ owner: 'system' }` and `{ owner: 'tab' }` each turn into the matching topic action; invalid `clear` payloads (`{}`, an unknown owner, an extra key) are rejected; a durable error from the system clear becomes a request rejection.
- `src/plugins/topics.test.ts`: the `clear` action with `owner: 'system'` calls the system clear and not `clearAll`; `owner: 'tab'` calls `clearAll` and not the system clear; a failed system clear returns the error and leaves `clearAll` uncalled; the topic-declaration guard is updated to the new action shape.
- `src/schedule/system/manager.test.ts`: the system-save-failure case uses `owner: 'system'`; its assertions that tab schedules are untouched hold, and a follow-up `owner: 'tab'` clear empties tab schedules while leaving system schedules alone.
- `web/src/plugins/schedules/SchedulesTab.test.tsx`: remove the disabled-clear-button test; assert no clear control appears when nothing is scheduled; a system section's trash icon sends `clear` with `{ owner: 'system' }`; a tab section's sends `{ owner: 'tab' }`; the header shows the icon only for a section that has rows.
- `web/src/plugins/schedules/SchedulesRows` coverage comes through `SchedulesTab.test.tsx`; no separate test file.

## Out of scope

- The per-row trash action column (a separate backlog item). The trailing track added here is sized for it, but the rows do not render anything in it yet.
- Column alignment and ellipsis behavior (a separate backlog item).
- Any change to `schedule clear` or `schedule system clear` in the terminal commands, which are unchanged.
- Adding a single "clear everything" control. The issue asks for the icon to move out of the metadata bar.

## Open questions

None.

## Verification

Run `./scripts/run.mjs check-diff`. Manual check: create a system schedule and two tab schedules, open `schedules`, click the system section's trash icon and confirm only the project schedules disappear, then click the tab section's trash icon and confirm the tab schedules clear. Confirm the header columns still line up with the rows in both the full and docked layouts.
