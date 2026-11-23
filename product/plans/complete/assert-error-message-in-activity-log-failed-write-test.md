# Assert the error message in the activity log failed-write test

**Complexity: 1/10** — no production lines or files (one test edit), 2 requirements and 1 scenario (p=2.61).

## Goal

The activity log feature promised a single dedicated stderr line on the first failed write, with the formatted error message after the prefix. The test that pins this behavior checks the prefix and the trailing newline but never checks that anything follows the prefix, so a later refactor could drop the error detail and leave the suite green. The goal is to finish the assertion the plan named, so the one diagnostic that explains why logging stopped keeps carrying its cause.

## Requirements

1. The failed-write test asserts that a non-empty error message follows the `activity log: write failed, not logging for the rest of this run: ` prefix and comes before the trailing newline. This is the plan's named assertion: "assert exactly one write of `activity log: write failed, not logging for the rest of this run: ` followed by the error text" (`product/plans/complete/activity-logs.md:100`).
2. The assertion does not pin a specific OS error string such as `ENOTDIR`, so the test stays portable. This is the issue text: "without asserting a literal OS error string."

## Design decisions

- Strengthen the existing prefix assertion inside `src/activity-log/logger.test.ts` rather than adding a new test, because the finding is that one existing assertion stops short of the behavior the plan named.
- Express the requirement as a regex that requires at least one character after the prefix and before the newline, one of the approaches the issue's Proposal names, because it keeps the surrounding checks byte-for-byte and touches a single line.
- Keep the existing assertions for exactly one stderr line, the trailing newline, and the absence of any `message bus:` line, as the Proposal requires.
- Assert only that the message is present, not its wording, because `errorText` reflects a platform-specific filesystem error; coupling to `ENOTDIR` or `ENOENT` would make the test platform-dependent.
- Change only the test; the logger already writes `errorText(error)` on the dedicated line, so no production code needs to move.

## Preserved behavior

1. The first failed write emits exactly one dedicated stderr line, ending with a newline, and no `message bus:` line; the test `prints one stderr line and stops writing after a failed write` in `src/activity-log/logger.test.ts` must keep passing, and its `toHaveLength(1)`, `endsWith('\n')`, and no-`message bus:` assertions stay unchanged — no second line or bus report may appear.
2. A second append after a failed write writes nothing further; the same `prints one stderr line and stops writing after a failed write` test appends twice and still captures exactly one line, so an extra write must not appear.
3. Normal activity logging is unchanged: lazy directory creation, `logEnabled` gating, and delivery to other message-bus subscribers keep working as pinned by `creates no directory until the first entry is written`, `writes no entry and creates no directory when logEnabled is false`, and `still delivers entries to other subscribers when logEnabled is false` in the same file.

## Assumptions

1. The dedicated line is composed with the formatted error, so every real failure yields a non-empty suffix — `src/activity-log/logger.ts:25` (`activity log: write failed, not logging for the rest of this run: ${errorText(error)}\n`).
2. `errorText` returns the error's message or its string form, never an empty stand-in for a real `Error` — `src/error-text.ts:1-3` (`error instanceof Error ? error.message : String(error)`).
3. The dedicated diagnostic is defined as one line, so its error text contains no embedded newline — `product/plans/complete/activity-logs.md:33` ("prints exactly `activity log: write failed, not logging for the rest of this run: <error message>` to stderr, one line").
4. The test forces a real failed `mkdirSync` by placing a regular file at the project path — `src/activity-log/logger.test.ts:214-217` (`writeFileSync(regularFile, 'x'); const logger = new ActivityLogger(regularFile);`).

## Existing functionality

1. The stderr spy and capture — `src/activity-log/logger.test.ts:219` (`vi.spyOn(process.stderr, 'write').mockImplementation(() => true)`) and `:224` (`stderrWrite.mock.calls.map(([chunk]) => String(chunk))`).
2. The prefix assertion being extended — `src/activity-log/logger.test.ts:226` (`expect(lines[0]).toMatch(/^activity log: write failed, not logging for the rest of this run: /);`).
3. The regex assertion style already used in the file — `src/activity-log/logger.test.ts:138` (`expect(ts).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);`).
4. The error formatter the runtime line relies on — `src/error-text.ts:1` (`export function errorText(error: unknown): string {`).

## Implementation steps

1. In `src/activity-log/logger.test.ts`, in the test named `prints one stderr line and stops writing after a failed write`, replace the prefix-only `toMatch` on `lines[0]` with a regex that also requires at least one character after the prefix and before the trailing newline: `/^activity log: write failed, not logging for the rest of this run: .+\n$/`. Leave the `expect(lines).toHaveLength(1)`, the `expect(lines[0].endsWith('\n')).toBe(true)`, and the no-`message bus:` assertion exactly as they are. Do not add any literal OS error string. This is the only source edit. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Run `$janissary/scripts/run.mjs check-diff` and resolve any lint, typecheck, or test failures before moving on. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. This change hardens one assertion in a server test; it adds or changes no user interface.

## Tests

1. Requirement 1: the modified `prints one stderr line and stops writing after a failed write` test in `src/activity-log/logger.test.ts` now fails if the formatted error message is missing from the dedicated stderr line, which is the new coverage the finding asks for.
2. Requirement 2: the same test's regex matches any non-empty suffix, so no OS-specific error text is pinned.
3. Preserved behavior: the test's other three assertions keep pinning one line, the trailing newline, and no `message bus:` line, and the unchanged tests in the file plus `src/capture/execute-and-capture.test.ts` keep pinning the surrounding behavior.
4. Regression: `$janissary/scripts/run.mjs check-diff` runs the server tests for the changed file and confirms no other test loses its expected stderr behavior.

## Out of scope

- Changing `src/activity-log/logger.ts` or any other production code; the runtime diagnostic already includes `errorText(error)`.
- Asserting a literal OS error string such as `ENOTDIR` or `ENOENT`.
- Adding a new test file, changing other tests, or touching the capture test.
- Updating specs, help pages, or user and developer documentation; this is a test-only change with no behavior change.
- Editing the PR description or changing the PR title.

## Verification

`$janissary/scripts/run.mjs check-diff` first. Then run `npx vitest run --project server src/activity-log/logger.test.ts` and confirm every test passes. Finally read the edited test and confirm the regex requires at least one character after the `activity log: write failed, not logging for the rest of this run: ` prefix and before the newline, that it names no specific OS error string, and that the exactly-one-line, trailing-newline, and no-`message bus:` assertions are unchanged; a prefix-only regex or a literal OS error string would show the change was not made correctly.
