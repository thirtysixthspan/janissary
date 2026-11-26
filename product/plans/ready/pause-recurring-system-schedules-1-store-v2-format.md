# Migrate the system schedule store to version 2

**Complexity: 4/10** — ~30 added lines across 3 production files, 6 requirements, 7 decode scenarios (p=5.085)

Source: `./product/plans/complete/pause-recurring-system-schedules.md`. This is the first subplan; it depends on none.

## Goal

Prepare the durable system schedule store so a paused flag can be recorded and validated before any pause or resume behavior exists. Today the store writes `version: 1` and its decoder rejects every other version. This change widens the format to versions 1 and 2, gives version 2 a `paused` field that is valid only on recurring entries, and makes every save write version 2. Active schedules behave exactly as before; nothing in this change pauses anything. It is the foundation the later subplans build on.

## Requirements

1. "Every save of the system schedule store writes `version: 2`" (user answer: "Always v2").
2. "A version-1 store still loads, and its entries are all active" (user answer: "Always v2").
3. "A version-1 entry carrying `paused` is invalid and fails the load like any other invalid entry" (user answer: "Always v2").
4. "A version-2 entry whose `paused` field is present but not `true` is invalid" (user answer: "Always v2").
5. "A version-2 one-shot entry carrying `paused` is invalid, since only recurring schedules can be paused" (user answer: "Recurring system only").
6. "A store version above 2 is still unsupported and blocks saving" (user answer: "Always v2"; `product/specs/scheduling.md` § Durable system schedules).

## Design decisions

- `SystemScheduleEntry` gains one optional field `paused?: true`, absent while active. It is not a boolean: only the literal `true` is valid, so a stored `false` is rejected rather than treated as active.
- `SystemScheduleSnapshot` widens to `version: 1 | 2`. The decoder accepts both versions and returns the snapshot with the version it was read with; loading never rewrites the file.
- `paused` is illegal in a version-1 entry and legal in a version-2 entry only when the entry is recurring. A version-2 entry without `paused` is a normal active entry.
- Version 3 and higher remain unsupported, so an older Janissary that later saves this version-2 file still reports it as unsupported. No migration tool is provided.
- The manager's private `save` writes version 2 for every snapshot it commits, including snapshots with no paused entries. A missing store file keeps loading as the empty version-1 snapshot it returns today, because that path never goes through the decoder.
- `SystemScheduleStore.save` re-decodes the snapshot it is given (`src/schedule/system/store.ts:58` `const decoded = decodeSystemScheduleSnapshot(snapshot);`), so the decoder must accept version 2 in the same change that makes the manager write version 2; otherwise every save fails as unsupported.

## Preserved behavior

1. A newer unsupported store version is reported distinctly, is never rewritten, and blocks saving. Accepting version 2 must not make the decoder accept any higher version, and must not let a version-3 file be overwritten. Pinned by `src/schedule/system/store-decode.test.ts` › `distinguishes unsupported schema versions`; the "newer" sample in that test and in the unsupported-version cases of `src/schedule/system/manager.test.ts` › `ignores %s without rewriting it or accepting new schedules` and `src/schedule/system/storage.integration.test.ts` moves from 2 to 3, with no other assertion change.

## Assumptions

1. System schedule entries are the shared entry shape plus a key and a runscript name: `src/schedule/system/types.ts:3` `export type SystemScheduleEntry = ScheduleEntry & { key: string; script: string };`.
2. The store decoder checks required fields and ignores extra ones, so a `paused` field would pass a version-1 decode unless the decoder is changed: `src/schedule/system/store-decode.ts:6` `function validEntry(value: unknown): value is SystemScheduleEntry {`.
3. Any version other than 1 is unsupported today: `src/schedule/system/store-decode.ts:18` `if (value.version !== 1) return { ok: false, kind: 'unsupported-version', version: value.version as number };`.
4. The manager writes the snapshot version as a literal in one place: `src/schedule/system/manager.ts:137` `const result = this.store.save({ version: 1, entries } satisfies SystemScheduleSnapshot);`.
5. A missing store file loads as an empty snapshot with a literal version: `src/schedule/system/store.ts:48` `if (!pathExists(this.file)) return { ok: true, snapshot: { version: 1, entries: [] } };`.
6. The snapshot type allows only version 1 today: `src/schedule/system/types.ts:5` `export type SystemScheduleSnapshot = { version: 1; entries: SystemScheduleEntry[] };`.

## Existing functionality

1. The decoder's `validEntry` guard validates every stored entry and rejects unknown recurrence data: `src/schedule/system/store-decode.ts:6` `function validEntry(value: unknown): value is SystemScheduleEntry {`.
2. `decodeSystemScheduleSnapshot` already classifies loads as ok, invalid, or unsupported-version: `src/schedule/system/store-decode.ts:14` `export function decodeSystemScheduleSnapshot(value: unknown): StoreLoadResult {`.
3. `SystemScheduleStore.save` re-decodes an explicit snapshot and refuses to overwrite an unsupported file: `src/schedule/system/store.ts:57` `save(snapshot: SystemScheduleSnapshot): StoreSaveResult {`.
4. The manager funnels every mutation through one private `save`: `src/schedule/system/manager.ts:136` `private save(entries: SystemScheduleEntry[]): boolean {`.
5. Valid stores round-trip through recurrence entries produced by the schedule parser: `src/schedule/system/store-decode.test.ts:23` `it('round-trips recurrence entries produced by the schedule parser', () => {`.

## Implementation steps

Each step ends green under `$janissary/scripts/run.mjs check-diff`.

1. Add the field and widen the type. In `src/schedule/system/types.ts`, add `paused?: true` to `SystemScheduleEntry` and widen `SystemScheduleSnapshot` to accept `version: 1 | 2`. No other type changes; `StoreLoadResult` and `StoreSaveResult` keep their shapes.
2. Change the decoder. In `src/schedule/system/store-decode.ts`, have `decodeSystemScheduleSnapshot` accept versions 1 and 2 and pass the expected version into `validEntry`. In `validEntry`, reject any `paused` field when the expected version is 1, and when it is 2 require `paused` to be absent or exactly `true` and require an entry carrying it to be recurring. Keep reporting any other version as `{ ok: false, kind: 'unsupported-version' }`. Return the snapshot with the version it was read with, not a hardcoded 1.
3. Change the writer. In `src/schedule/system/manager.ts`, make the private `save` pass `version: 2` while keeping the `satisfies SystemScheduleSnapshot` annotation. Leave `src/schedule/system/store.ts:48` alone so a missing file still produces the empty version-1 snapshot.
4. Update the assertions that pin a load-after-save version. In `src/schedule/system/manager.test.ts`, `src/schedule/system/storage.integration.test.ts`, and `src/commands/schedule.test.ts`, change only the expected `version: 1` value on snapshots read back after a manager mutation to `version: 2`; do not touch any other expectation. Assertions that follow an explicit `store.save({ version: 1, ... })` inside a test, such as `src/schedule/system/manager.test.ts:201` and its load at `:211`, still read version 1 and must stay at 1. In `src/schedule/system/store-decode.test.ts`, `src/schedule/system/manager.test.ts` (the `unsupported version` row at `:220`), and `src/schedule/system/storage.integration.test.ts` (`:40` to `:42`), move the "newer version" sample from 2 to 3.
5. Add decoder cases in `src/schedule/system/store-decode.test.ts` for version-2 snapshots with and without `paused`, `paused` in a version-1 entry, a non-`true` `paused` in a version-2 entry, and a paused one-shot in a version-2 entry. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None found. This subplan changes the persisted format and validation only; it adds or changes no user-visible surface.

## Tests

- `src/schedule/system/store-decode.test.ts`: version-2 snapshots with and without `paused` decode; `paused` in a version-1 entry is invalid; `paused: false` or any other non-`true` value in a version-2 entry is invalid; a paused one-shot in a version-2 entry is invalid; version 3 is still unsupported (Requirements 1 to 6).
- `src/schedule/system/manager.test.ts`, `src/schedule/system/storage.integration.test.ts`, `src/commands/schedule.test.ts`: existing assertions that a load after a save returns version 1 now expect version 2, and the unsupported-version sample moves from 2 to 3 (Requirements 1 and 6; Preserved behavior 1).
- `src/schedule/system/store-decode.test.ts` still covers duplicate ids with distinct keys, invalid recurrence, and parser-produced entries at version 1 (Requirement 2).

## Out of scope

- No pause or resume operation, no manager pause methods, and no command or tab control. Those land in later subplans.
- No support for version 3 or any future version.
- No migration tool: an older Janissary that reads a version-2 file reports it as unsupported.
- No change to the missing-file empty snapshot, to `flock`/atomic-write behavior, or to startup recovery.

## Verification

1. `$janissary/scripts/run.mjs check-diff`.
2. Concrete reading-based check: read `src/schedule/system/store-decode.ts` and `src/schedule/system/types.ts` and confirm `validEntry` rejects `paused` at version 1, accepts only the literal `true` at version 2, and rejects it on one-shots, while `SystemScheduleSnapshot` lists `version: 1 | 2`. Then run the app against a scratch project, create one system schedule with `schedule system ping every 1m script ping`, and read `.janissary/system-schedules.json`: the top-level `version` must be `2`. Hand-edit that file to `version: 3`, relaunch, and confirm stderr reports the store as unsupported with version 3 and that the file is not rewritten.
