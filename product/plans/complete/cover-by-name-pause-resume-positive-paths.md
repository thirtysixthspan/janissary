# Cover positive-path tests for pausing and resuming system schedules by name

**Complexity: 2/10** — 10 requirements and 8 test scenarios, with 0 production lines added and 0 production files edited (p=4.08)

## Goal

Close a technical-debt gap in the new schedule mutations: `pauseByName` and `resumeByName` are currently exercised only through tests of their no-op branches, so a wrong name predicate could make both operations silently do nothing while the suite stays green. Add positive-path tests that commit real changes through the manager and verify both the in-memory list and the persisted version-2 snapshot. No production change is expected; the source is touched only if a new test exposes a real defect in the name predicates.

Source: `./product/backlog/pull-request.md` entry "Cover the untested by-name pause and resume paths, a technical-debt gap in the new schedule mutations."

## Requirements

1. "add one test that adds two recurring entries sharing an id and a one-shot with a different id, calls pauseByName with that id".
2. "asserts both recurring entries carry paused with all other fields unchanged".
3. "the one-shot is untouched" by that pause.
4. "the version-2 snapshot persists that state".
5. "add a second test that pauses a recurring entry, calls resumeByName with its id".
6. "asserts the paused flag is gone" after the resume.
7. "nextRun lies in the future" after the resume.
8. "the persisted snapshot matches" the resumed entry.
9. "Leave the existing no-save tests untouched because they pin the no-op branches".
10. "No source change is expected unless a new test exposes a defect in the name predicates in src/schedule/system/mutations.ts, in which case correct the predicate there and keep the by-key behavior identical".

## Design decisions

- Add exactly two tests to the existing `describe('SystemScheduleManager mutations')` block in `src/schedule/system/manager.test.ts`; do not create a new test file or new helper.
- Drive both tests through `SystemScheduleManager.pauseByName` and `resumeByName`, not the pure mutations directly, so the tests cover the commit path and the persisted snapshot the Proposal asks for.
- For the pause test, build both same-id recurring entries with distinct keys and differing fields, plus a third entry with a different id, so "all other fields unchanged" and "one-shot untouched" are both observable.
- Assert with the file's existing `toEqual` style: compare the list against the added entries spread with `paused: true` and the untouched entry as-is, then compare `new SystemScheduleStore(root).load()` to `{ ok: true, snapshot: { version: 2, entries } }`.
- For the resume test, give the recurring entry an `intervalMs` so `nextFutureRun` yields `now + intervalMs`; bound the result between a captured `Date.now()` before the call and `Date.now() + intervalMs`, as the existing `resumeByKey` test does.
- Leave the existing no-op and no-save tests byte-for-byte untouched.
- Edit `src/schedule/system/mutations.ts` only if a new test fails because of a by-name predicate defect; in that case change only that predicate and leave both by-key functions identical.

## Preserved behavior

1. Pausing and resuming by key keep their current behavior. The new by-name tests must not touch the by-key functions. Pinned by `src/schedule/system/manager.test.ts` › `pauseByKey flags a recurring entry without changing its other fields and saves version 2`.
2. Pausing an already-paused entry and resuming an active entry still write nothing. Pinned by `src/schedule/system/manager.test.ts` › `does not call save when pausing an already-paused or resuming an active entry`.
3. A one-shot schedule is still never paused, by key or by name. Pinned by `src/schedule/system/manager.test.ts` › `does not pause a one-shot schedule`.
4. A resumed entry still gets a future next run from the recurrence settings. Pinned by `src/schedule/system/manager.test.ts` › `resumeByKey clears the flag, sets a future nextRun, and does not replay the paused gap`.

## Assumptions

1. The manager already exposes both by-name operations: `src/schedule/system/manager.ts:87` `pauseByName(name: string): SystemScheduleResult {` and `src/schedule/system/manager.ts:99` `resumeByName(name: string): SystemScheduleResult {`.
2. The by-name predicates already match `id`, the same field cancel-by-name uses: `src/schedule/system/mutations.ts:24` `return pauseMatching(entries, (entry) => entry.id === name);` and `src/schedule/system/mutations.ts:12` `return entries.filter((entry) => entry.id !== name);`.
3. Both mutations return the original array when nothing changed, so a positive path is observable only when a matching recurring entry is active or paused: `src/schedule/system/mutations.ts:45` `return changed ? next : entries;`.
4. `commit` persists a version-2 snapshot before swapping memory: `src/schedule/system/manager.ts:170` `const result = this.store.save({ version: 2, entries } satisfies SystemScheduleSnapshot);`.
5. `nextFutureRun` returns `now + intervalMs` for an interval schedule: `src/schedule/time.ts:38` `if (entry.intervalMs) return now.getTime() + entry.intervalMs;`.
6. The test file has a shared entry builder: `src/schedule/system/manager.test.ts:14` `const schedule = (id: string, key: string) => ({`.

## Existing functionality

1. The `schedule(id, key)` helper builds test entries with a caller-chosen key: `src/schedule/system/manager.test.ts:14` `const schedule = (id: string, key: string) => ({`.
2. Snapshot assertions use `new SystemScheduleStore(root).load()` with a version-2 literal: `src/schedule/system/manager.test.ts:30` `expect(new SystemScheduleStore(root).load()).toEqual({ ok: true, snapshot: { version: 2, entries: [] } });`.
3. The `pauseByKey` positive test is the model for the new pause test: `src/schedule/system/manager.test.ts:408` `it('pauseByKey flags a recurring entry without changing its other fields and saves version 2', () => {`.
4. The `resumeByKey` positive test is the model for the new resume test: `src/schedule/system/manager.test.ts:485` `it('resumeByKey clears the flag, sets a future nextRun, and does not replay the paused gap', async () => {`.
5. The pure by-name edits already exist and need no new production code: `src/schedule/system/mutations.ts:23` `export function pauseSystemScheduleByName(` and `src/schedule/system/mutations.ts:31` `export function resumeSystemScheduleByName(`.

## Implementation steps

Each step ends green under `$janissary/scripts/run.mjs check-diff`.

1. In `src/schedule/system/manager.test.ts`, add the pause-by-name positive test beside the existing pause tests: add two recurring entries with the same id and distinct keys plus one one-shot with a different id, call `pauseByName` with the shared id, assert both recurring entries equal the added entries with `paused: true` and no other field changed, assert the one-shot equals the added entry exactly, and assert the version-2 snapshot holds the same list. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Add the resume-by-name positive test beside the existing resume tests: add a recurring entry with `intervalMs`, pause it through `pauseByName`, capture `Date.now()`, call `resumeByName` with its id, assert the returned entry has no `paused` field and a `nextRun` after the captured time but within one interval of the call, and assert the persisted version-2 snapshot equals the in-memory list. Build command: `$janissary/scripts/run.mjs check-diff`.
3. Only if one of the new tests fails because `pauseSystemScheduleByName` or `resumeSystemScheduleByName` matches the wrong field, correct that predicate in `src/schedule/system/mutations.ts`, leaving `pauseSystemScheduleByKey` and `resumeSystemScheduleByKey` unchanged; rerun the full test file to confirm both new and existing cases pass. If both tests pass, skip this step entirely. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None found. This change adds tests only; no command, control, or rendered state changes.

## Tests

- `src/schedule/system/manager.test.ts`: pause-by-name commits both same-id recurring entries with `paused: true` and all other fields intact, leaves the different-id one-shot untouched, and persists the version-2 snapshot (Requirements 1 to 4).
- `src/schedule/system/manager.test.ts`: resume-by-name clears `paused`, gives the entry a future `nextRun` within one interval, and persists a snapshot matching the in-memory entry (Requirements 5 to 8).
- Existing pause/resume tests in `src/schedule/system/manager.test.ts` stay unchanged and continue to pin the no-op branches and by-key behavior (Requirements 9 and 10; Preserved behavior 1 to 4).

## Out of scope

- No production behavior change: the by-name predicates are edited only if a new test proves they are wrong.
- No spec, help page, user or developer documentation changes.
- No changes to the existing no-op, no-save, failed-save, or one-shot tests.
- No new pause/resume command, plugin intent, topic action, or tab UI; those are separate work.

## Verification

1. `$janissary/scripts/run.mjs check-diff`.
2. Concrete reading-based check: read `src/schedule/system/manager.test.ts` and confirm it contains exactly two new by-name positive tests, that the existing no-save test `does not call save when pausing an already-paused or resuming an active entry` is unchanged, and that each new test compares `new SystemScheduleStore(root).load()` to a version-2 snapshot; then run `npx vitest run src/schedule/system/manager.test.ts` and confirm the new tests pass alongside every existing pause/resume case.
