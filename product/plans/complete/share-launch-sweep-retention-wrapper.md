# refactor(state): share the days-to-cutoff launch sweep across recordings, captures, and transcripts

**Complexity: 5/10** — 9 requirements, 5 files edited, 6 test scenarios, ~35 added lines (p=5.51)

## Goal

Recordings, captures, and the two kinds of transcript all age out under the one `logRetentionInDays` setting, but each owner module carries its own copy of the rule that turns a day count into a cutoff: a module-private `DAY_MS`, the same empty-directory guard, and the same `launchedAt - days * DAY_MS` arithmetic, and boot starts the four through four near-identical unawaited lines. This change gives the rule one owner so a later change to it (a floor, a different unit, a different rejection policy) lands everywhere at once, and folds the four boot lines into one call, without changing what any sweep deletes or when.

## Requirements

1. "add `reapFilesOlderThanDays(directory, extension, launchedAt, days)` that returns when `directory` is empty" — called with an empty directory, it resolves without sweeping anything.
2. "otherwise calls `reapFilesOlderThan(directory, extension, launchedAt - days * 86_400_000)`" — called with a directory, it sweeps that directory for that extension with a cutoff `days` whole days before `launchedAt`.
3. "with the single `DAY_MS`" — the day length exists once in production code, in the new helper's module.
4. "zero meaning launch" — with `days` of `0`, the cutoff it passes is `launchedAt` itself.
5. "Make `reapHarnessRecordings` … `reapHarnessCaptures` … `reapHarnessTranscripts` … and `reapShellTranscripts` … delegate to it and drop their own `DAY_MS`" — each of the four wrappers forwards its own directory, its own extension, `launchedAt`, and `days` to the shared helper and has no cutoff arithmetic or guard of its own.
6. "fold the four calls in `src/main.ts` `boot` into one `startLaunchSweeps(config.logRetentionInDays)`" — boot starts all four sweeps through one call.
7. "still unawaited" — `startLaunchSweeps` returns before any sweep settles, so boot never waits for one.
8. "with a swallowing `.catch` per sweep so one failure cannot stop another" — a sweep that rejects is swallowed and does not prevent the other three from being started or from completing.
9. "assert the directory, extension, `launchedAt`, and `days` each passes" — each of the four sweeps is started with the same launch time and the configured day count.

## Design decisions

- The helper lives in a new module `src/state/retention.ts`, not in `src/state/reaper.ts` as the proposal suggests. The four wrapper tests replace `src/state/reaper.js` wholesale with a factory mock that supplies only `reapFilesOlderThan` (Assumption 3); a helper exported from that same module would be absent from the mock, and its internal call to `reapFilesOlderThan` would not be interceptable anyway. A separate module that imports `reapFilesOlderThan` from `./reaper.js` runs for real under those mocks, so every existing wrapper assertion — directory, extension, `launchedAt - 7 * 86_400_000`, `launchedAt` for zero, and the uninitialized guard — keeps passing unchanged and now pins the shared helper end to end. This keeps `src/state/reaper.ts` and `src/state/reaper.test.ts` untouched, as the entry requires.
- `startLaunchSweeps(launchedAt, days)` lives in a new module `src/launch-sweeps.ts` beside `src/main.ts`, not in `src/state/`, because it imports the four feature owners (`src/harness/…`, `src/shell/…`) and `src/state/` must not depend upward on them. It takes `launchedAt` as a parameter so a test can pin the launch time; boot passes `Date.now()` once, so all four sweeps share one launch instant instead of four nearly equal ones (Assumption 4).
- `startLaunchSweeps` returns `void` and attaches a `.catch(() => {})` to each sweep's promise individually, keeping today's per-sweep isolation (Assumption 5).
- The wrapper tests are left as they are rather than rewritten to mock `reapFilesOlderThanDays`; the per-wrapper forwarding (Requirement 5) is already proven by their existing directory/extension/cutoff assertions through the real helper, and rewriting them would discard assertions the change must keep.

## Preserved behavior

1. A sweep for a wrapper whose directory was never initialized reaches no reaper call; it must not resolve the empty directory against the process working directory. Pinned by `src/harness/recording-file.test.ts` "reaps nothing before a directory has been chosen".
2. Recordings are swept as `.cast` files in `.janissary/recordings` with the cutoff `launchedAt - days * 86_400_000`; they must not be swept as `.txt` or with any other cutoff. Pinned by `src/harness/recording-file.test.ts` "reaps .cast files older than the retention window".
3. Captures and both transcript kinds are swept as `.txt` files in their own directories; none may sweep another's directory or a different extension. Pinned by `src/harness/capture/file.test.ts` "reaps .txt files older than the retention window".
4. A retention of zero uses launch itself as the cutoff; it must not subtract anything or keep files from earlier runs. Pinned by `src/shell/transcript/transcript-file.test.ts` "uses launch as the cutoff when retention is zero".
5. `reapFilesOlderThan` deletes only direct regular files with the extension whose mtime is strictly before the cutoff, and never rejects; none of its cases may change. Pinned by `src/state/reaper.test.ts` "keeps files whose mtime is at or after the cutoff".

## Assumptions

1. The day length is 86,400,000 ms in every copy today, e.g. `src/harness/recording-file.ts:10` `const DAY_MS = 86_400_000;`.
2. Each wrapper guards an uninitialized directory before sweeping, e.g. `src/harness/capture/file.ts:30` `if (!captureDirectory) return;`.
3. The wrapper tests mock the reaper module wholesale, e.g. `src/harness/recording-file.test.ts:17` `vi.mock('../state/reaper.js', () => ({ reapFilesOlderThan }));`.
4. Boot reads the clock separately per sweep today, `src/main.ts:83` `void reapHarnessCaptures(Date.now(), config.logRetentionInDays).catch(() => {});`, so passing one `Date.now()` shifts each cutoff by at most the microseconds between those calls.
5. Boot starts each sweep unawaited with its own swallowing handler, `src/main.ts:82` `// The launch sweep runs in the background; boot never waits for it.`
6. `src/main.ts` is 118 lines, well under the 200-line `max-lines` limit, and the four wrapper modules shrink.

## Existing functionality

1. The directory sweep itself, `src/state/reaper.ts:7` `export async function reapFilesOlderThan(directory: string, extension: string, cutoffMs: number)`.
2. The recordings wrapper, `src/harness/recording-file.ts:33` `export async function reapHarnessRecordings(launchedAt: number, days: number)`.
3. The captures wrapper, `src/harness/capture/file.ts:29` `export async function reapHarnessCaptures(launchedAt: number, days: number)`.
4. The harness transcripts wrapper, `src/harness/transcript-file.ts:26` `export async function reapHarnessTranscripts(launchedAt: number, days: number)`.
5. The shell transcripts wrapper, `src/shell/transcript/transcript-file.ts:26` `export async function reapShellTranscripts(launchedAt: number, days: number)`.
6. The retention setting boot already holds, `src/main.ts:77` `const config = loadConfig(cwd);`.

## Implementation steps

1. Add `src/state/retention.ts` exporting `reapFilesOlderThanDays(directory, extension, launchedAt, days): Promise<void>`, owning the single `DAY_MS`, returning early for an empty directory and otherwise awaiting `reapFilesOlderThan` from `./reaper.js` with the cutoff `launchedAt - days * DAY_MS`. Add `src/state/retention.test.ts`. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Make `reapHarnessRecordings`, `reapHarnessCaptures`, `reapHarnessTranscripts`, and `reapShellTranscripts` each a one-line delegation to `reapFilesOlderThanDays` with their module's directory and extension, remove each module's `DAY_MS`, and switch their import from `reaper.js` to `retention.js`. The four existing wrapper test files are not edited and must pass. Build command: `$janissary/scripts/run.mjs check-diff`.
3. Add `src/launch-sweeps.ts` exporting `startLaunchSweeps(launchedAt, days): void`, which starts the four wrappers with the same arguments, each with its own swallowing `.catch`, and returns without awaiting. Replace the four lines in `src/main.ts` `boot` with one `startLaunchSweeps(Date.now(), config.logRetentionInDays)` call under the existing comment, and replace the four wrapper imports with the one `./launch-sweeps.js` import. Add `src/launch-sweeps.test.ts`. Build command: `$janissary/scripts/run.mjs check-diff`.
4. Add one sentence to the `logRetentionInDays` row of `product/specs/application-config.md` stating that each directory is swept on its own, so one that fails does not stop the others. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The change has no user-facing surface.

## Tests

- `src/state/retention.test.ts`, mocking `./reaper.js` the way the wrapper tests do:
  - resolves without calling `reapFilesOlderThan` for an empty directory (Requirement 1);
  - passes the directory, extension, and `launchedAt - 7 * 86_400_000` for seven days (Requirements 2, 3);
  - passes `launchedAt` itself for zero days (Requirement 4).
- `src/launch-sweeps.test.ts`, mocking the four wrapper modules:
  - starts each of the four sweeps once with the given `launchedAt` and `days` (Requirements 6, 9);
  - returns before a sweep that never settles has settled (Requirement 7);
  - a sweep that rejects leaves the other three started and causes no unhandled rejection (Requirement 8).
- The existing wrapper tests in `src/harness/recording-file.test.ts`, `src/harness/capture/file.test.ts`, `src/harness/transcript-file.test.ts`, and `src/shell/transcript/transcript-file.test.ts` stay unchanged and now cover Requirement 5 through the real helper.

## Out of scope

- Changing `reapFilesOlderThan` or `src/state/reaper.test.ts`.
- Changing which files any sweep deletes, the retention default, or how `logRetentionInDays` is decoded.
- Rewording the "started from `src/main.ts`" comments in the wrapper modules and `src/state/dirs.ts`, which stay accurate because boot in `src/main.ts` still starts the sweeps.
- User and developer documentation under `documentation/`.

## Verification

Run `$janissary/scripts/run.mjs check-diff` and confirm lint, typecheck, and the server tests pass, including the four untouched wrapper test files.

Then check it against the running app: create `.janissary/recordings/old.cast` and `.janissary/captures/old.txt` in a project, set both mtimes ten days back with `touch -t`, leave `logRetentionInDays` at `7`, and launch with `npm start`. Within a moment of the launch line, both files are gone, while a `.cast` touched to the current time is still there. A failure looks like either old file surviving launch, or launch blocking until the sweep finishes.
