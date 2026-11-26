# Add pause and resume mutations and manager operations

**Complexity: 5/10** — ~80 added lines across 3 files, 7 requirements, 9 new units (p=5.536)

## Goal

Give the system schedule owner the ability to pause and resume entries and to keep a paused entry inert while it is waiting on the shell. Today the owner can create, cancel, clear, and fire schedules but has no notion of a paused entry. This subplan adds four pure list edits, four thin manager methods, and the two firing guards that make a pause survive a tick already in flight. After this subplan the engine can pause and resume by key and by name; no command or tab surface calls it yet.

Source: `./product/plans/complete/pause-recurring-system-schedules.md`. Depends on `pause-recurring-system-schedules-1-store-v2-format.md` for the `paused` field and `pause-recurring-system-schedules-2-paused-recovery-time.md` for `nextFutureRun`.

## Requirements

1. "A recurring system schedule can be paused" ("Add Pause and Resume to recurring system rows").
2. "A paused system schedule can be resumed" ("Add Pause and Resume to recurring system rows").
3. "A paused schedule keeps its key, name, runscript, spec, and recurrence fields unchanged" ("keep its recurrence settings for later resumption").
4. "A paused schedule does not fire while it is paused" ("suspend one timer through a maintenance window").
5. "Pausing a schedule leaves runscript lines already queued in the system shell from an earlier firing in place, and they run as normal" (user answer: "Let them run").
6. "A pause committed while a tick is waiting on the system shell for that schedule stops that firing: nothing is enqueued and the paused entry is left as stored" (user answer: "Re-check and skip").
7. "Pausing an already-paused schedule, or resuming an active one, writes nothing to the store" (user answer: "Core set": "The store must not be rewritten unless a schedule is actually paused or resumed").

## Design decisions

- The four pure edits go in `src/schedule/system/mutations.ts`, beside `cancelSystemScheduleByKey` and `cancelSystemScheduleByName`: pause and resume by key, pause and resume by name. Pause touches only entries with `recurring === true` and no `paused` flag, adding `paused: true` without changing any other field. Resume removes the `paused` property entirely rather than setting it to `false`, because a non-`true` value is invalid in a version-2 store, and sets `nextRun` from `nextFutureRun(entry, new Date())`. Name edits affect every matching entry, as cancel-by-name does.
- `SystemScheduleManager` gains `pauseByKey`, `resumeByKey`, `pauseByName`, and `resumeByName`, each returning the existing `SystemScheduleResult`. Each computes the edit, returns success without saving when the edit produced an identical list, and otherwise calls the existing `commit`, reporting `could not save system schedules` when the save fails.
- `fireDue` skips a paused entry before claiming it, so a pause that lands before a tick stays inert. `applyFireOutcome` already re-reads the current entry by key; extend it to commit nothing and enqueue nothing when that current entry is paused. This makes a pause committed while a tick waits on the shell win.
- This is a deliberate limit: a pause followed by a resume inside one shell wait leaves the entry active, so that one due batch still runs. Upgrading it later would compare the current entry's `nextRun` with the claimed one, but that is not part of this change.
- If `manager.ts` would pass the 200-line limit after the four methods and guards, extract the fire-outcome logic into a new focused module beside `manager.ts` and import it back, rather than compacting existing code.

## Preserved behavior

1. Cancelling by name removes every same-named system row and cancelling by key removes only that row. Pause and resume must not remove any row or change any key. Pinned by `src/schedule/system/manager.test.ts` › `persists distinct keys for repeated names and cancels all name matches or one key`.
2. A due active entry is saved before its runscript batch is appended. The new pause check must not reorder the save and the append for an active entry. Pinned by `src/schedule/system/manager.test.ts` › `saves a due firing before appending its contiguous script batch`.
3. Same-named due entries fire independently by key. Pausing one same-named row must not stop another active row with that name from firing. Pinned by `src/schedule/system/manager.test.ts` › `fires same-named due entries independently by key and persists each outcome`.
4. A failed boot-recovery save keeps due entries in memory and the persisted snapshot unchanged. The pause wiring must not let a paused entry trigger a save or fire after that failure. Pinned by `src/schedule/system/manager.test.ts` › `keeps due entries and the persisted snapshot when boot recovery cannot save`.

## Assumptions

1. A per-key mutation already exists to model pause and resume on: `src/schedule/system/manager.ts:67` `cancelByKey(key: string): SystemScheduleResult {`.
2. Name and key mutations already live as pure edits beside the manager: `src/schedule/system/mutations.ts:10` `export function cancelSystemScheduleByName(entries: SystemScheduleEntry[], name: string): SystemScheduleEntry[] {`.
3. A tick claims a due entry, awaits the shell, then commits from the claimed copy: `src/schedule/system/manager.ts:105` `private applyFireOutcome(`.
4. The firing loop picks up entries whose stored next run is at or before now: `src/schedule/system/manager.ts:91` `if (claimed.nextRun > now) continue;`.
5. Every mutation saves the full snapshot before swapping memory and publishing: `src/schedule/system/manager.ts:129` `private commit(entries: SystemScheduleEntry[]): boolean {`.
6. A paused entry is marked with an optional `paused?: true`, and `nextFutureRun` is available, from the two earlier subplans.

## Existing functionality

1. `commit` saves, swaps memory, and publishes in one place, so the pause methods need no new persistence path: `src/schedule/system/manager.ts:129` `private commit(entries: SystemScheduleEntry[]): boolean {`.
2. `cancelByKey` is the model for a thin manager method that calls a pure edit and returns `SystemScheduleResult`: `src/schedule/system/manager.ts:67` `cancelByKey(key: string): SystemScheduleResult {`.
3. `fireSystemBatch` performs the shell wait whose outcome `applyFireOutcome` commits: `src/schedule/system/manager.ts:95` `outcome = await fireSystemBatch(this.managers, claimed, now);`.
4. `appendSystemBatch` appends the queued lines only after a successful commit: `src/schedule/system/manager.ts:116` `else appendSystemBatch(this.managers, current, outcome.lines);`.

## Implementation steps

Each step ends green under `$janissary/scripts/run.mjs check-diff`.

1. Add the four pure edits to `src/schedule/system/mutations.ts`. Pause-by-key and pause-by-name map matching recurring active entries to `{ ...entry, paused: true }` and leave every other entry and field alone. Resume-by-key and resume-by-name map matching paused entries to a copy without `paused` whose `nextRun` comes from `nextFutureRun(entry, new Date())`. Do not mutate inputs.
2. Add the four manager methods to `src/schedule/system/manager.ts`, each delegating to one pure edit and to `commit`, with the skip-save-on-no-change rule and the `could not save system schedules` failure string, matching `cancelByKey` in shape.
3. Make `fireDue` skip a paused entry before the `claimed.nextRun > now` check, and make `applyFireOutcome` return without committing or enqueuing when the current entry found by key carries `paused`. If this pushes `manager.ts` past 200 lines, extract the fire-outcome logic into a new module in `src/schedule/system/` and import it back; do not compact code to fit.
4. Add tests in `src/schedule/system/manager.test.ts`: `pauseByKey` keeps every other field and saves version 2; a paused due entry does not fire on tick; a pause committed during deferred shell preparation stops the enqueue and leaves the entry paused; `resumeByKey` sets a future `nextRun` and fires nothing for the gap; pausing an already-paused entry does not call save; a failed save leaves memory unchanged; a one-shot is not paused; paused state survives a reload of the same store. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None found. This subplan adds engine operations with no command, intent, or rendered control. A reader can invoke them only from tests at this checkpoint.

## Tests

- `src/schedule/system/manager.test.ts`: the eight pause/resume cases listed in Implementation steps, covering Requirements 1 to 7 and the no-notice expectation that pausing appends nothing to a transcript.
- `src/schedule/system/manager.test.ts` existing cancel-by-name/by-key, save-before-append, same-name independence, and failed-boot-save cases continue to pin Preserved behavior 1 to 4.
- `src/schedule/system/store-decode.test.ts`: a paused entry reloaded from a version-2 store decodes with its flag and all other fields intact (Requirement 3).

## Out of scope

- No `schedule system pause`/`resume` grammar, messages, or usage line; those land in later subplans.
- No plugin intents, topic actions, wire field, or tab control.
- No pause of one-shot or tab-owned schedules.
- No pause reason, pause-until time, pause-all control, or notification.
- No change to the advance loop in recovery or to the store format.

## Verification

1. `$janissary/scripts/run.mjs check-diff`.
2. Concrete reading-based check: read `src/schedule/system/mutations.ts` and `src/schedule/system/manager.ts` and confirm all four edits leave non-matching entries byte-identical, that resume calls `nextFutureRun` rather than `computeNextRun`, that `fireDue` checks `paused` before claiming, and that `applyFireOutcome` returns before `commit` and `appendSystemBatch` when the current entry is paused. Then run `npx vitest run src/schedule/system/manager.test.ts` and confirm the new pause/resume cases pass while the cancel, save-order, same-name, and failed-boot cases still pass.
