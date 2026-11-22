# Capture expected stderr in the system schedule save-failure test

**Complexity: 1/10** — no production lines or files (one test and one spec edit), 5 requirements and 1 scenario (p=3.10).

## Goal

The server test suite prints `System schedules could not save: Unsafe system schedule directory: .../.janissary` because one test deliberately puts a regular file where the `.janissary` state directory belongs to force a save failure. The manager correctly reports that failure on `process.stderr`, but the line is expected output from a test, not a real problem, and it pollutes the suite log. The goal is to capture that expected error inside the test and assert it, so the suite stays quiet while the runtime error report stays covered.

## Requirements

1. The server test suite no longer emits `System schedules could not save: Unsafe system schedule directory: .../.janissary` from the test that makes the schedule store unusable. This is the issue text verbatim: "resolve the issue in the test suite: System schedules could not save: Unsafe system schedule directory: .../system-schedule-failure-ESjVAy/.janissary".
2. The test still asserts that adding a schedule returns `ok: false` when the store cannot write.
3. The test still asserts that the in-memory schedule list stays empty after the failed save.
4. The test still asserts that no `schedules.changed` event is emitted after the failed save.
5. The failed save is still reported on `process.stderr`, captured and asserted by the test so the runtime report is not lost.

## Design decisions

- Capture `process.stderr.write` inside the single test that deliberately forces the failure, rather than adding a server-wide setup stub, because the line comes from one known test and a global stub would hide genuine errors elsewhere in the suite.
- Keep the existing filesystem setup (a regular file at `.janissary`) because it exercises the real store validation path; only its output is captured, not the scenario.
- Assert the captured message so removing the runtime error report fails the test instead of silently dropping coverage.
- Change only a test and its spec; the manager's error reporting is correct runtime behavior and stays untouched.

## Assumptions

1. `SystemScheduleManager.save()` writes the failure with `process.stderr.write` — `src/schedule/system/manager.ts:139` (`process.stderr.write(\`System schedules could not save: ${saveError(result)}\n\`);`).
2. `SystemScheduleStore.validatePath()` rejects a regular file at the state-directory path with that exact message — `src/schedule/system/store.ts:28` (`Unsafe system schedule directory: ${directory}`).
3. Spying on `process.stderr.write` with `vi.spyOn(...).mockImplementation(() => true)` is an established pattern in this same file — `src/schedule/system/manager.test.ts:225`.
4. The offending test is the one that creates `system-schedule-failure-` scratch roots — `src/schedule/system/manager.test.ts:35` (`mkdtempSync(path.join(tmpdir(), 'system-schedule-failure-'))`).

## Existing functionality

1. The stderr spy pattern — `src/schedule/system/manager.test.ts:225` uses `vi.spyOn(process.stderr, 'write').mockImplementation(() => true)` and restores it after the assertions.
2. The manager's failure report — `src/schedule/system/manager.ts:136-141` turns a failed `store.save()` into a boolean and writes `System schedules could not save: ...` to stderr.
3. The schedule-change subscription — `src/schedule/system/manager.test.ts:39` subscribes to `messageBus.on('schedules', 'changed', changed)` and asserts it was not called.
4. The system schedule spec — `product/specs/testing.md` already records how test setups keep expected warnings out of suite output for the client project.

## Implementation steps

1. In `src/schedule/system/manager.test.ts`, in the test named `leaves memory and emits nothing when the atomic save cannot write`, install a `process.stderr.write` spy with `vi.spyOn(...).mockImplementation(() => true)` before `createController(sinks, root)` so both the ACP record scan warning and the schedule-save error are captured.
2. Keep the three existing assertions (`add()` returns `ok: false`, the list stays empty, and the `schedules.changed` spy was not called), then add an assertion that the captured stderr includes `System schedules could not save: Unsafe system schedule directory:`.
3. Restore the spy with `stderr.mockRestore()` after the assertions and before the existing `void controller.shutdown()` call; shutdown writes no stderr.
4. Add a short paragraph to the server section of `product/specs/testing.md` stating that tests which deliberately break the schedule store capture expected stderr and assert the report, keeping the failure line out of suite output.
5. Run `$janissary/scripts/run.mjs check-diff` and resolve any failures before moving on.

## UI design

None. This change touches one test and one spec; it adds or changes no user interface.

## Tests

1. Requirements 1 and 5: the modified test in `src/schedule/system/manager.test.ts` captures `process.stderr` and asserts the `System schedules could not save: Unsafe system schedule directory:` message is reported, so the runtime report remains covered while the line stays out of suite output.
2. Requirements 2-4: the same test keeps its assertions that `add()` fails, memory stays empty, and no `schedules.changed` event fires.
3. Regression coverage: `$janissary/scripts/run.mjs check-diff` runs the server tests for the changed file and confirms no other test loses its expected stderr behavior.

## Out of scope

- Changing `SystemScheduleManager.save()` or `SystemScheduleStore.validatePath()`; the runtime error report is correct.
- Adding a server-wide stderr setup file or stubbing stderr in other tests that emit unrelated noise.
- Replacing the filesystem-based failure setup with a mock; the real validation path is what the test is meant to exercise.
- Updating help pages, user documentation, or any other spec than `product/specs/testing.md`. No user-visible behavior changes.

## Verification

`$janissary/scripts/run.mjs check-diff` first. Then run `npx vitest run --project server src/schedule/system/manager.test.ts` and confirm all tests pass with no `System schedules could not save: Unsafe system schedule directory:` line in the output. Finally read the edited test and confirm the stderr spy is installed before controller creation, the expected message is asserted, and the spy is restored before shutdown.
