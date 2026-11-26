# Guard the schedules Space/p shortcut against focused buttons

**Complexity: 2/10** — one production file, four requirements (p=3.76); a single target check plus two colocated keyboard tests.

## Goal

Keep the Schedules tab's new Space/p pause shortcut from swallowing keys that belong to a focused button. With a row selected, a Space or `p` keydown that bubbles up from the New schedule button or from another row's pause button is currently consumed by the tab, which prevents the button's own activation and toggles the selected row instead. The shortcut must act only when the list container itself owns the key, so keyboard users can activate the visible buttons and the correct schedule is mutated.

## Requirements

1. "guard the new Space/p branch of onKeyDown so it acts only when the event target is the list container itself" — a Space or `p` keydown whose target is the `.schedules-tab` container still toggles the selected recurring system row.
2. "With a row selected, a Space keydown on the focused New schedule button ... is consumed by the tab's onKeyDown, which prevents the button's own activation" — a Space keydown bubbling from the focused New schedule button must no longer toggle or pause the selected row.
3. "a keyboard user who selects a row and then tabs to New schedule pauses or resumes that schedule instead of opening the dialog" — that same Space keydown must activate the New schedule button so `openScheduleLaunch` fires.
4. "a user who tabs to one row's pause control can change a different row's schedule; the wrong recurring entry is mutated" — a Space keydown bubbling from a second row's pause button must toggle that button's own row and must not toggle the selected row.

## Design decisions

- Add one identity check, `e.target === e.currentTarget`, to the existing Space/p branch; this is the container half of `ownsKey` in `web/src/plugins/scripts/ScriptsTab.tsx:10-13`.
- Do not adopt `ownsKey`'s `.scripts-row` allowance here: the entry says the shortcut acts only when the event target is the list container itself, not any descendant control, and the selection and delete-dialog key paths stay as they are.
- Keep the guard local to the Space/p branch. The NAV_KEYS, Delete/Backspace, and Enter branches keep their current behavior and target handling.
- Prove the fix with real keyboard activation through `@testing-library/user-event`, which fires the button's native click on Space keyup, rather than by asserting only that a synthetic `keyDown` returned `true`.
- Leave the second pull-request backlog entry, all specs, all help pages, all user/developer documentation, and the PR description untouched.

## Preserved behavior

1. Space and `p` on the list container toggle only a selected recurring system row; the guard must not toggle with no selection, with a modifier held, or on a non-pausable row — pinned by `toggles only a selected recurring system row with Space and p`.
2. A consumed Space on the container stays inside the list; the guard must not introduce a path that lets a handled keydown reach a body listener — pinned by `does not bubble a consumed Space past the list`.
3. Arrow/Home/End selection still responds to keydown on the container; the guard must not suppress or retarget those keys — pinned by `moves the selection with the arrow, Home, and End keys`.
4. Delete/Backspace still opens the delete dialog for the selected row on the container; the guard must not interfere with that path — pinned by `confirms before cancelling a schedule, and sends nothing when the user backs out`.

## Assumptions

1. `web/src/plugins/schedules/SchedulesTab.tsx:73-101` attaches one `onKeyDown` to the container and handles Space/p, selection, delete, and Enter in separate branches; only the Space/p branch needs the new check.
2. `web/src/plugins/scripts/ScriptsTab.tsx:10-13` defines `ownsKey` whose first clause is `event.target === event.currentTarget`, the target-check pattern the entry points at.
3. `web/src/plugins/schedules/SchedulesTab.tsx:103-110` renders the `.schedules-tab` div with `onKeyDown` and `tabIndex={0}`, so a keydown on any descendant button bubbles to that handler.
4. `web/src/plugins/schedules/SchedulesRows.tsx:49-62` gives each recurring system row a pause button whose own `onClick` calls `onTogglePause(entry)` for that row, so native Space activation targets the button's row.
5. `web/src/plugins/schedules/schedules-keys.ts:14-15` keeps `canPauseRow` as the single rule for which rows the keyboard shortcut may toggle.
6. `@testing-library/user-event` is already used by colocated client tests, for example `web/src/plugins/scripts/ScriptsTab.test.tsx:157-167`, which focuses a button and drives it with `user.keyboard`.

## Existing functionality

1. `ownsKey` in `web/src/plugins/scripts/ScriptsTab.tsx:10` supplies the container-identity check the fix mirrors.
2. `togglePause` in `web/src/plugins/schedules/SchedulesTab.tsx:65` sends the pause/resume intent with the full owner identity and refocuses the list container.
3. `canPauseRow` in `web/src/plugins/schedules/schedules-keys.ts:14` decides whether a selected row is pausable.
4. `renderTab` and `makeCapabilities` in `web/src/plugins/schedules/SchedulesTab.test.tsx:20-42` expose the `intent` and `openScheduleLaunch` spies the new assertions use.
5. `recurringSystem` in `web/src/plugins/schedules/SchedulesTab.test.tsx:361-368` builds recurring system rows for the new test fixtures.

## Implementation steps

Each step ends green under `$janissary/scripts/run.mjs check-diff`, which is the build command for every step.

1. In `web/src/plugins/schedules/SchedulesTab.tsx`, extend the Space/p branch of `onKeyDown` with an `e.target === e.currentTarget` condition placed alongside the existing `selected !== null` and modifier checks. Leave the NAV_KEYS, Delete/Backspace, and Enter branches byte-for-byte unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.
2. In `web/src/plugins/schedules/SchedulesTab.test.tsx`, import `@testing-library/user-event` and add two tests to the `SchedulesTab pause and resume` suite: one that selects a recurring system row, focuses the New schedule button, drives Space with `user.keyboard(' ')`, and asserts `openScheduleLaunch` fired with no pause/resume intent; one that selects a recurring system row, focuses a second recurring system row's pause button, drives the same key, and asserts that second row's pause intent fired and the selected row's did not. Keep the existing container-driven keyboard tests unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.
3. Read both files back and confirm the guard appears only in the Space/p branch and that no other production file changed. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. The Schedules tab's keyboard interaction changes only for keys aimed at focused buttons: Space on the New schedule button now opens the New schedule dialog, and Space on a row's pause button now toggles that button's row. No layout, styling, or visible state changes.

## Tests

- Requirement 2 and 3: in `web/src/plugins/schedules/SchedulesTab.test.tsx`, select a recurring system row, focus the New schedule button, press Space through `user.keyboard(' ')`, and assert `openScheduleLaunch` was called once and `intent` was not called.
- Requirement 4: in the same file, select the first of two recurring system rows, focus the second row's pause button, press Space, and assert the pause intent carries the second row's identity and never the selected row's.
- Requirements 1 and the preserved behaviors: the existing `toggles only a selected recurring system row with Space and p`, `does not bubble a consumed Space past the list`, selection, and delete-dialog tests keep passing unchanged.
- If the sandbox denies loopback sockets and `src/index.test.ts` fails with `EPERM`, also run `npx vitest run --project client web/src/plugins/schedules/SchedulesTab.test.tsx` directly and report that result; do not change test infrastructure to force a green check.

## Out of scope

- No change to the row-icon CSS or to `SchedulesRows.tsx`; the second pull-request backlog entry stays unresolved.
- No spec, help page, or page under `documentation/user-documentation/` or `documentation/developer-documentation/`.
- No PR description or title change, and no merging or closing of PR 2253.
- No new module, component, type, or production file.

## Verification

1. `$janissary/scripts/run.mjs check-diff` must be green, apart from a documented sandbox-only `EPERM` in `src/index.test.ts` if that occurs, in which case the directly run client test file must be green.
2. Concrete end-to-end check against the running app: open the Schedules tab, select a recurring system schedule, Tab to the New schedule button and press Space — the New schedule dialog opens and the selected row's paused state does not change. Then Tab to a different recurring row's pause button and press Space — that row's paused state changes and the previously selected row's does not. A pause/resume of the selected row in the first case, or of the wrong row in the second, means the change was not made correctly.
