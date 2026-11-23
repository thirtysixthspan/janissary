# Stop writing harness transcript files when `logEnabled` is false

**Complexity: 3/10** — ~8 added lines across 2 production files, 4 requirements, 6 test scenarios (p=4.38)

## Goal

The user asked for a `logEnabled` setting that "when false, prevents harness transcripts being recorded at all", applying to the file only, while monitors keep receiving transcript entries in memory. This subplan threads `getConfig().logEnabled` into `HarnessTranscriptTailer` as a `persist` constructor flag: with it false, the tailer still accumulates entries for monitors but never opens a file, so `harness transcript <name>` reports that no transcript is available.

Source plan: `product/plans/complete/harness-transcripts.md` (implementation step 4 and the `logEnabled` parts of step 5). Run order: 5 of 5. All four earlier subplans must have landed before this one starts:

- `product/plans/ready/harness-transcripts-1-log-config-settings.md` adds `logEnabled` to `Config`. Without it `getConfig().logEnabled` does not typecheck.
- `product/plans/ready/harness-transcripts-2-generic-reaper.md` adds the reaper that subplan 4 calls.
- `product/plans/ready/harness-transcripts-3-move-transcript-directory.md` moves the directory to `.janissary/transcripts/harness/`, changes the mock paths in `src/harness/transcript/tailer.test.ts`, and adds that file's two-tailer test "writes each tab to its own file", whose two constructions this subplan also updates.
- `product/plans/ready/harness-transcripts-4-retention-sweep.md` rewrites the `product/specs/harness-recording.md` § Session transcripts paragraph this subplan extends, and adds the launch sweep that Verification step 3 checks.

## Requirements

1. With `logEnabled` false, no harness transcript file is written (source Requirement 12; user answers: "when false, prevents harness transcripts being recorded at all"; "File only").
2. With `logEnabled` false, monitors still receive the harness tab's transcript entries (source Requirement 13; user answer: "Monitors keep receiving transcript entries in memory").
3. With `logEnabled` false, `harness transcript <name>` reports `No transcript available for "<name>" yet.` (source Requirement 14; user answer: "File only").
4. With `logEnabled` true, every entry the session produces is appended to the file for the life of the tab (source Requirement 3; feature text: "continually appended to the file for the duration of the session").

## Design decisions

- Gate only the file write on `logEnabled`. `harnessRuntime()` reads `getConfig().logEnabled` and passes it to the `HarnessTranscriptTailer` constructor as a `persist` flag. The tailer skips opening its file when the flag is false, still accumulates entries for monitors, and stays free of config reads (user answers: "File only", "Constructor flag").
- Make `persist` a required `boolean` and the constructor's fourth and last parameter, declared as a private readonly parameter property like the three before it. The existing calls in `src/harness/transcript/tailer.test.ts` then only need the argument appended (Assumption 3).
- In `append`, push the blocks to `entries` first, then return before `open` and `write` when `persist` is false. `open` stays the only place that calls `ensureHarnessTranscriptDirectory`, `harnessTranscriptPath`, and `createWriteStream` (Assumption 1), so with `persist` false no directory or file is created and `transcriptFile()` stays undefined (Assumption 2).
- Read the flag when the runtime is built, the way `src/tab/manager.ts:247` reads `getConfig().recordShellTabs` when it builds a shell tab's observers (Existing functionality 1). The in-memory config is loaded once at launch and a hand edit is never re-read while the app runs (Assumption 8). A change to `.janissary/config.json` therefore takes effect for harness tabs opened after the next launch.
- A remote harness tab is built by the same `harnessRuntime()`, so the flag applies to it too (Assumption 4). The flag comes from the local `.janissary/config.json`: the far side only pushes blocks and writes no transcript file of its own (Assumption 9). The pushed blocks still reach the local tailer and monitors, and the local file is written only when `logEnabled` is true.
- The `no harness transcript found` notification and the polling are independent of `persist`. A tailer with `persist` false still polls, still gives up at the resolve deadline, and still notifies exactly once.
- The launch sweep stays unconditional. This subplan reads `logEnabled` nowhere but `harnessRuntime()` (user answer: "Yes, still reap").
- In `src/harness/observers.test.ts`, control the flag by spying on `getConfig` through a namespace import of `../config.js` and returning the real config spread with only `logEnabled` overridden, the pattern at `src/notifications/native.test.ts:45` (Existing functionality 3). Restore the spy with `vi.restoreAllMocks()` in a new `afterEach`, as `src/notifications/native.test.ts:36` does. Do not add a `vi.mock('../config.js', ...)` factory: a spread of the real config keeps every other field valid and typed.
- Update `product/specs/harness.md` § Session transcript as well as the two specs the source plan names. Its list of reasons for `No transcript available for "<name>" yet.` and its "written continuously and automatically" sentence would otherwise be wrong when `logEnabled` is false (Assumption 10).

## Preserved behavior

1. Before the tailer has written a file, `harness transcript <name>` reports `No transcript available for "<name>" yet.`. It must not open an empty or missing file. Test: `src/harness/manager.test.ts` "reports no transcript before the tailer has written a file".
2. With `persist` true, the transcript file is created lazily on the first entry. A tab that produces no entry must not leave an empty file in `.janissary/transcripts/harness/`. Test: `src/harness/transcript/tailer.test.ts` "creates no file and holds no entries before the first record" (constructed with `persist` true after this subplan).
3. When no session record is found within the deadline, `no harness transcript found` is notified once for the tab. It must not be repeated, and it must not fire for a tab whose source resolved. Test: `src/harness/transcript/tailer.test.ts` "notifies exactly once at the resolve deadline and stops polling".
4. Monitors watching a harness tab receive its accumulated transcript entries. They must not fall back to screen snapshots for a tab whose tailer has entries. Test: `src/monitor/harness-transcript-feed.test.ts` "feeds a harness target its accumulated transcript entries as one block".
5. A remote harness tab's transcript blocks, pushed from the far side, reach the local tailer through the remote transcript source, whatever `logEnabled` is; with `logEnabled` true the tailer writes them locally. The source must not drop or hold back a pushed block. Test: `src/remote/transcript-source.test.ts` "hands the pushed blocks to the next poll".

## Assumptions

1. The tailer opens its file only from `append`, on the first entry: `src/harness/transcript/tailer.ts:72` `if (!this.stream) this.open();`.
2. `harness transcript <name>` reports on the tailer's `transcriptFile()`, which is undefined until a file is opened: `src/harness/transcript/tailer.ts:53` `transcriptFile(): string | undefined {` and `src/harness/subcommands.ts:109` `if (!file) return \`No transcript available for "${label}" yet.\`;`.
3. `HarnessTranscriptTailer` is constructed in production only in `harnessRuntime()`: `src/harness/observers.ts:65` `new HarnessTranscriptTailer(label, source, () => { notify(managers, 'transcript-unavailable', label); })`.
4. Every test double of `HarnessTranscriptTailer` ignores its constructor arguments, so none needs a change for the new parameter: `src/harness/manager.test.ts:69` `HarnessTranscriptTailer: vi.fn(function () {`, `src/harness/observers.test.ts:30` `HarnessTranscriptTailer: vi.fn(function () {`, and `src/harness/manager-browser-test-fixture.ts:52` `HarnessTranscriptTailer: vi.fn(function () {`.
5. Every other use of `HarnessTranscriptTailer` is type-only and unaffected by the constructor: `src/harness/manager.ts:17`, `src/harness/runtime.ts:5`, `src/harness/runtime-access.ts:3`, and `src/harness/subcommands.ts:3`, each `import type { HarnessTranscriptTailer } from`.
6. Remote harness tabs feed the same tailer through a pushed source built in the same `harnessRuntime()`: `src/harness/observers.ts:63` `const source = channel ? managers.remote.transcriptSource(label) : createTranscriptSource(`.
7. `harnessRuntime()` has one production caller, and the one test that replaces it mocks the whole module: `src/harness/tab-spawn.ts:103` `harnessRuntime({ managers: this.managers, name, label, id, cwd, autoApprove, autoResume, channel, browser: spawnEnv.handle })` and `src/sessions/harness-roundtrip.test.ts:31` `harnessRuntime: () => {`.
8. The in-memory config is set only by `loadConfig` at launch and by `updateConfig`, which merges into the in-memory value rather than re-reading the file's other keys, so a hand edit of `logEnabled` applies only at the next launch: `src/config.ts:108` `let config: Config = { ...DEFAULT_CONFIG };` and `src/config.ts:170` `const next = decodeConfig({ ...config, ...partial }, DEFAULT_CONFIG);`.
9. The far side of a remote tab reads the session record and pushes blocks without a tailer or file: `src/remote/serve-transcript.ts:27` `if (blocks.length > 0) this.emit({ type: 'transcript', blocks });`, received locally at `src/remote/entry-factory.ts:144` `default: { transcript.push(frame.blocks); }`.
10. The harness command spec lists the reasons `harness transcript` reports no transcript, and says the transcript is always written: `product/specs/harness.md:991` "The tab is a harness tab whose transcript is not available" and `product/specs/harness.md:995` "Unlike a capture, the transcript is written continuously and automatically for the tab's whole life".
11. `src/harness/observers.ts` does not import `../config.js` today, and `src/harness/observers.test.ts` does not mock it, so its existing tests see the in-memory defaults (`logEnabled: true` after subplan 1): `src/config.ts:108` `let config: Config = { ...DEFAULT_CONFIG };`.
12. The only `vi.mock` of `../config.js` in `src/` is in a test that never builds a harness runtime, so no partial config mock reaches `harnessRuntime()`: `src/open/file-manager.test.ts:18` `vi.mock('../config.js', () => ({`.
13. Every `getConfig` spy in a test spreads the real config, so each still carries `logEnabled: true` once subplan 1 adds it: `src/controller.test.ts:1837` and `src/command/manager.test.ts:1080` `vi.spyOn(config, 'getConfig').mockReturnValue({` followed by `...defaults,`.
14. `src/harness/transcript/tailer.test.ts` constructs the tailer seven times on disk (`src/harness/transcript/tailer.test.ts:46` `new HarnessTranscriptTailer('claude', fakeSource([[]]), vi.fn());` through line 110), and subplan 3 adds two more in "writes each tab to its own file", for nine in all: `product/plans/ready/harness-transcripts-3-move-transcript-directory.md:66` "a `claude` tailer and a `codex` tailer, each fed one entry".

## Existing functionality

1. Reading a config flag when a tab's observers are built: `src/tab/manager.ts:247` `if (declares && getConfig().recordShellTabs) {`.
2. The tailer's in-memory entry stream monitors read: `src/harness/transcript/tailer.ts:47` `entriesAfter(index: number): string[]`.
3. Overriding one config field in a test by spying on `getConfig` and spreading the real config: `src/notifications/native.test.ts:45` `vi.spyOn(config, 'getConfig').mockReturnValue({`, with `import * as config from '../config.js';` at `src/notifications/native.test.ts:4`.
4. A `harnessRuntime()` test that gets a tailer constructed through the remote branch: `src/harness/observers.test.ts:65` `const managers = makeManagers('remote transcript source');`.

## Implementation steps

1. **Tailer flag and runtime wiring.** In `src/harness/transcript/tailer.ts`, add the `persist: boolean` constructor parameter and the early return in `append` as set in Design decisions. Update the class comment to say that when `persist` is false (`logEnabled` off) the file is never opened while entries still accumulate for monitors. In `src/harness/observers.ts`, import `getConfig` from `../config.js` and pass `getConfig().logEnabled` as the new last argument of the `new HarnessTranscriptTailer(...)` call in `harnessRuntime()`. Add one sentence to the `harnessRuntime` comment saying the tailer writes its file only when `logEnabled` is true. In `src/harness/transcript/tailer.test.ts`, append `true` to all nine constructions (Assumption 14) and add the new tests. In `src/harness/observers.test.ts`, add the new tests. `src/harness/manager.test.ts` and `src/harness/manager-browser-test-fixture.ts` need no change (Assumption 4). Both production files stay far under the 200-line `max-lines` limit (`tailer.ts` 104 raw lines, `observers.ts` 101). Build command: `$janissary/scripts/run.mjs check-diff`, which must be green before step 2.
2. **Specs.** Make three spec edits:
   - In `product/specs/harness-recording.md` § Session transcripts, add a new paragraph directly after the transcript-file paragraph (the one subplans 3 and 4 leave ending with the retention sweep and the unused legacy directory) and before "A session record is not created the instant a harness starts". It says that with `logEnabled` false in `.janissary/config.json` (see [[application-config]]) no harness tab, local or remote, writes a transcript file. Monitors still receive the tab's session transcript entries. `harness transcript <name>` reports `No transcript available for "<name>" yet.`, and the tab's transcript button does nothing. The setting is read when a harness tab opens, so a change applies to tabs opened after the next launch. The launch sweep still runs.
   - In `product/specs/application-config.md`, extend the `logEnabled` row that subplan 1 added. State that it switches harness session transcript files under `.janissary/transcripts/harness/` on or off (see `harness-recording.md` § Session transcripts). Monitors keep receiving transcript entries either way. It does not stop the launch sweep, and it does not govern shell-tab transcripts or recordings. A change applies to harness tabs opened after the next launch.
   - In `product/specs/harness.md` § Session transcript, add "`logEnabled` is false in `.janissary/config.json`" to the reasons listed in the "The tab is a harness tab whose transcript is not available" bullet. Qualify "Unlike a capture, the transcript is written continuously and automatically for the tab's whole life" with "unless `logEnabled` is false" (Assumption 10).

   Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

No new surface. With `logEnabled` false, two existing surfaces show the state they already show before a file exists:

1. `harness transcript <name>` prints `No transcript available for "<name>" yet.` (`src/harness/subcommands.ts:109`).
2. The harness tab's 📋 "Open transcript" button does nothing (`src/controller/transcript.test.ts` "is a no-op when the tailer has no transcript file yet").

## Tests

- `src/harness/transcript/tailer.test.ts`, new test "keeps entries in memory without a file when persist is false": a tailer constructed with `persist` false and a source yielding `['user: hello']` then `['assistant: hi']`, after two poll intervals, returns both entries from `entriesAfter(0)`. `createWriteStream`, `ensureHarnessTranscriptDirectory`, and `harnessTranscriptPath` were never called, and `transcriptFile()` is undefined (Requirements 1, 2, 3).
- `src/harness/transcript/tailer.test.ts`, new test "still notifies once at the resolve deadline when persist is false": with `persist` false and a source that never resolves, `onUnavailable` is called exactly once after the deadline and not again after a second deadline's worth of time. This shows Preserved behavior 3 holds with the flag off.
- `src/harness/transcript/tailer.test.ts`: the existing "accumulates entries and appends them to one lazily opened stream" test, now constructed with `persist` true, keeps passing unchanged in its assertions (Requirement 4).
- `src/harness/observers.test.ts`, new test "passes logEnabled false to the transcript tailer": with `getConfig` spied to return `logEnabled: false` (Design decisions) and `createTranscriptSource` mocked once (`mockReturnValueOnce`) to return a fake source whose `poll` returns an empty list and whose `resolved` returns false, so a local tab constructs a tailer, the fourth argument of the last constructor call, read through `vi.mocked(HarnessTranscriptTailer).mock.lastCall`, is `false` (Requirement 1). Import `HarnessTranscriptTailer` from `./transcript/tailer.js` to read the mock, and add `vi.mocked(HarnessTranscriptTailer).mockClear()` to the existing `beforeEach` beside `vi.mocked(captureWiring).mockClear()`.
- `src/harness/observers.test.ts`, new test "passes logEnabled true to the transcript tailer": the same setup with `logEnabled: true` passes `true` (Requirement 4).
- `src/harness/observers.test.ts`, new test "gates a remote tab's transcript file on logEnabled too": a remote tab built as in Existing functionality 4, with `logEnabled: false`, passes `false` (Design decisions, remote tab).
- Requirement 3 needs no new manager test. With `persist` false, `transcriptFile()` stays undefined (first tailer test above), and `src/harness/manager.test.ts` "reports no transcript before the tailer has written a file" already pins the message for an undefined file (Preserved behavior 1).

## Out of scope

- Gating the launch sweep on `logEnabled`; the sweep runs either way (user answer: "Yes, still reap").
- Shell-tab text transcripts, recordings, captures, and the daily activity log; `logEnabled` does not govern them (user answer: "Harness transcripts only").
- Changing the setting at runtime; a change takes effect for tabs opened after the next launch.
- Removing or rewriting a transcript file an earlier session wrote while `logEnabled` was true; it stays until the sweep ages it out.
- Documentation follow-up feature candidate: the user documentation's harness transcript section and configuration reference for `logEnabled`. User and developer documentation is owned by `update-documentation.md`, not by a feature PR or plan.

## Verification

1. `$janissary/scripts/run.mjs check-diff`
2. **`logEnabled` off.** From the checkout, run `npm run build` first, because `bin/janus.mjs` runs `dist/main.js` whenever it exists. In a scratch project, set `"logEnabled": false` in `.janissary/config.json`, launch with `node bin/janus.mjs <scratch>`, open `harness claude`, and send a prompt. Start `monitor <persona> claude` with any persona. After the reply, no new file appears in `.janissary/transcripts/harness/`. `harness transcript claude` reports `No transcript available for "claude" yet.`, and the tab's 📋 button opens nothing. After the monitor's next 30-second flush, open the monitor's transcript from the clipboard button on its connections-panel row: it holds the harness session's prompt and reply text, not only rendered screens. A failure looks like a new file being written, `harness transcript` opening a file, or the monitor receiving only screen snapshots.
3. **Sweep unaffected.** Stop with `node bin/janus.mjs stop <scratch>`. With `logEnabled` still false, create `.janissary/transcripts/harness/old.txt` by hand (step 2 wrote no file), backdate it by ten days with `touch -t` and a stamp from `date -v-10d +%Y%m%d%H%M` (macOS) or `date -d '10 days ago' +%Y%m%d%H%M` (Linux), then relaunch. The backdated file is deleted within a few seconds. A failure looks like the backdated file surviving.
4. **`logEnabled` on.** Stop, set `"logEnabled": true`, relaunch, open `harness codex` and `harness opencode`, and send each a prompt. Each gets its own file in `.janissary/transcripts/harness/` that grows with every reply, and `harness transcript codex` opens the codex one. A failure looks like a missing file for either harness, or a file that stops growing after the first reply.
