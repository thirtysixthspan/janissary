# fix(scripts): run check-diff checks concurrently and show failure output

**Complexity: 6/10** — 22 requirements, ~115 added lines, 11 output scenarios across one script and the lint config (p=6.25)

## Goal

`check-diff` is the development loop every agent and contributor runs after each change, and its header promises concurrent lint, typecheck, and test runs. Today it delivers neither concurrency nor diagnostics. Feature text: "check-diff is not actually concurrent, and it hides all failure output. scripts/check-diff.mjs:91-104 calls execFileSync inside Promise executors, so each command blocks the event loop and they run sequentially despite the header claiming concurrency. Worse, every tool uses stdio: 'pipe' and the catch blocks discard the error, so a failing check prints only ✗ with no diagnostics — --seq doesn't help either." This change makes the checks really run concurrently, makes a failing check say what failed and why, and makes `--seq` stop at the first failure as its header promises.

## Requirements

1. In the default mode, every selected check is started before any of them finishes, so the total wall time is clearly less than the sum of the per-check times. Feature text: "Use execFile/spawn with real promises".
2. A failing check's full combined stdout and stderr is printed after that check finishes. User answer: "Failures only — buffer each check's stdout+stderr; when it finishes, print its full output under a header only if it failed".
3. A passing check's output is not printed. User answer: "so a green run stays as quiet as today".
4. The summary prints one line per check. User answer: "One line per check".
5. A passing check's summary line reads `<name> ✓ (<ms>ms)`, e.g. `lint ✓ (812ms)`. User answer, chosen preview: "lint ✓ (812ms)".
6. A failing check's summary line reads `<name> ✗ (<ms>ms) exit <code>: <command>`, e.g. `tsc ✗ (4210ms) exit 2: npm run typecheck:diff`. Feature text: "include the exit code and command in the summary"; user answer, chosen preview: "tsc ✗ (4210ms) exit 2: npm run typecheck:diff".
7. The command shown for the `lint` check is `$janissary/scripts/run.mjs lint-files`, not the absolute path actually spawned. User answer, chosen preview: "lint ✗ (812ms) exit 1: $janissary/scripts/run.mjs lint-files".
8. The command shown for each npm-backed check is the npm invocation it runs: `npm run typecheck:diff`, `npm run test:diff:server`, `npm run test:diff:web`, and `npm run test:server -- src/commands.test.ts`. User answer: "Runner form — show what a user would type to rerun it".
9. A check killed by a signal reads `<name> ✗ (<ms>ms) exit <SIGNAL>: <command>`, e.g. `tsc ✗ (4210ms) exit SIGKILL: npm run typecheck:diff`. User answer, chosen preview: "tsc ✗ (4210ms) exit SIGKILL: npm run typecheck:diff".
10. A check whose command cannot start reads `<name> ✗ (<ms>ms) could not start (<error message>): <command>`, e.g. `test:web ✗ (3ms) could not start (spawn npm ENOENT): npm run test:diff:web`. User answer, chosen preview: "test:web ✗ (3ms) could not start (spawn npm ENOENT): npm run test:diff:web".
11. A check that failed without an exit code still has any output it produced printed. User answer: "plus any output it produced".
12. With `--seq`, the checks run one at a time. User answer: "Sequential + fail-fast — run checks one at a time".
13. With `--seq`, the run stops at the first failing check and prints that check's output. User answer: "stop at the first failure, printing that check's output".
14. With `--seq`, every check after the first failure is not run, and its summary line reads `<name> - skipped` with no timing. User answer, chosen preview: "test:server - skipped".
15. When files changed but no check applies to them, the run prints `check:diff: no checks apply to the changed files` and exits 0. User answer: "Print `check:diff: no checks apply to the changed files` and exit 0".
16. The checks that run are still chosen by the changed paths exactly as today: `lint` for lintable files, `tsc` for `src/` or `web/`, `test:server` for `src/` or `scripts/`, `test:web` for `web/`, `test:help` for help markdown. A check the diff does not need must not run. User answer: "Keep: which checks run for which changed paths … Must not: run a check the diff doesn't need".
17. A clean working tree still prints `check:diff: no changes` and exits 0. User answer: "`check:diff: no changes` + exit 0 on a clean tree".
18. The run exits 0 only when every check passed. User answer: "exit 0 iff all pass, else 1".
19. The run exits 1 when any check failed, including a check killed by a signal or one that could not start; it must never exit 0 when any check failed. User answer: "Must not: … exit 0 on any failure"; "Overall run exits 1".
20. The summary still ends with a `total: <ms>ms` line. User answer: "per-check ms and `total:` line".
21. `scripts/**/*.mjs` files are exempt from the `max-lines` lint rule. User answer: "scripts should not need to follow file length rule"; "Exempt scripts/ in config".
22. `ai/guidelines/code-guidelines.md` states that `scripts/` is exempt from the 200-line limit. User answer: "a one-line note in ai/guidelines/code-guidelines.md that scripts/ is exempt".

## Design decisions

- Replace the blocking `execFileSync` calls with asynchronous child processes awaited as real promises (feature text).
- Each check runs through `child_process.spawn` with stdout and stderr piped and appended to one buffer in arrival order. Its promise resolves on the child's `close` event with the exit code and signal, or on its `error` event with the spawn error, and never rejects. Whichever of the two events fires first settles the promise; a `close` that follows an `error` is ignored, so a check that could not start is always reported as `could not start`. `settle` prints the failure block before it resolves, so a `settled` flag is required: without it the later `close` would call `settle` again and print that block a second time, even though the second `resolve` would be a no-op. The elapsed time runs from the spawn call to that settling event. This keeps the two streams in order and has no size cap, unlike `execFile`'s default `maxBuffer` (user answer: "spawn + one buffer"). The whole output is held in memory and trimmed to its last 200 lines only when printed; check output is at most a few megabytes, so this is fine. If a check ever produces output large enough to matter, the upgrade path is to keep only a rolling window of the last 200 lines plus a dropped-line count.
- Each check's output is buffered, not streamed, so concurrent checks never interleave lines; it is printed as one block only when the check fails (user answer: "Failures only").
- A check's display command is its executable and arguments joined with spaces, which already gives the npm forms in Requirement 8. Only the `lint` check carries an explicit display string, `$janissary/scripts/run.mjs lint-files`, because what it spawns is `node` with an absolute path (Requirement 7).
- check-diff adds no SIGINT or SIGTERM handling. Ctrl-C in a terminal reaches the whole foreground process group, and a signal sent only to check-diff may leave its checks running (user answer: "Leave to the OS").
- `--seq` keeps its documented meaning, "sequential (fail-fast) for debugging" (`scripts/check-diff.mjs:6`), and the code is changed to honor the fail-fast half (user answer: "Sequential + fail-fast").
- The final exit status is set through `process.exitCode`, not `process.exit()`, so a long failure block written to a piped stdout is fully flushed before the process ends. Node writes to pipes asynchronously on POSIX, and `process.exit()` can cut that output short. The existing early `process.exit(0)` on a clean tree (`scripts/check-diff.mjs:22`) prints one short line and stays as it is.
- All logic stays in `scripts/check-diff.mjs` as a top-level script with no exports (user answer: "No tests, one file").
- `scripts/**/*.mjs` is exempted from `max-lines` in `eslint.config.mjs`, so the single file may grow past 200 lines (user answer: "Exempt scripts/ in config"). This rests on Assumption 5.
- No automated tests are added; the behavior is confirmed by the manual checks in Verification (user answer: "No tests, one file").

## Preserved behavior

None found. The behaviors the user named as preserved (check selection, the clean-tree message, the exit status, the timings) have no existing test pinning them, and the user chose to add no tests, so they are recorded as Requirements 16–20 and confirmed by manual checks in Verification.

## Assumptions

1. The concurrent path runs each tool's synchronous `run()` inside a `new Promise` executor, so the tools run one after another: `scripts/check-diff.mjs:91` "`const promises = tools.map(`" and `scripts/check-diff.mjs:97` "`tool.run();`".
2. Every tool pipes its output and the catch discards the error: `scripts/check-diff.mjs:43` "`stdio: 'pipe', encoding: 'utf8'`" and `scripts/check-diff.mjs:98` "`} catch {`".
3. The `--seq` path also discards the error: `scripts/check-diff.mjs:85` "`} catch {`".
4. No existing test exercises `scripts/check-diff.mjs`; tests for `scripts/` run in the server vitest project: `vitest.config.ts:14` "`include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs']`".
5. The `max-lines` rule is set in the config block that applies to every linted file, scripts included: `eslint.config.mjs:62` "`'max-lines': ['error', { max: 200, skipBlankLines: true, skipComments: true }]`".
6. The code guidelines state the 200-line limit for all JavaScript/TypeScript files: `ai/guidelines/code-guidelines.md:5` "JavaScript/TypeScript files should be limited to **200 lines of code**."

## Existing functionality

1. Changed-file detection: `scripts/changed-files.mjs:8` "`export function changedFiles()`".
2. Script-relative path resolution for the lint helper: `scripts/check-diff.mjs:14` "`const LINT_FILES = scriptPath('lint-files.mjs');`".
3. Help-markdown change detection: `scripts/check-diff.mjs:32` "`const touchesHelp = hasHelpMarkdownChanges(files);`".
4. Precedent for a per-path override that switches `max-lines` off: `eslint.config.mjs:116-117` "`files: ['**/*.test.ts', '**/*.test.tsx'],`" / "`rules: { 'max-lines': 'off' },`".

## Implementation steps

1. **Exempt scripts from the line limit.** In `eslint.config.mjs`, add a config block for `scripts/**/*.mjs` that turns `max-lines` off, modeled on the test-file override at `eslint.config.mjs:115-118`. In `ai/guidelines/code-guidelines.md`, add one bullet under `## File Size` saying that files under `scripts/` are exempt from the limit. Build command: `$janissary/scripts/run.mjs check-diff`.

2. **Rewrite check-diff's runner and output.** All changes are in `scripts/check-diff.mjs`; build command: `$janissary/scripts/run.mjs check-diff`.
   - Keep the change classification at `scripts/check-diff.mjs:19-35` and the conditions that push each check exactly as they are (Requirement 16).
   - Replace each check's `run` closure with data: a name and the executable and arguments to spawn (`node` with the `LINT_FILES` path for lint, `npm` with its arguments for the others). The lint check also carries its display string (see Design decisions).
   - Add a function that runs one check through `spawn` as described in Design decisions and resolves with its outcome: passed, exited non-zero with a code, killed by a signal, or failed to start with an error message, plus the buffered output and elapsed milliseconds.
   - Add formatting for the cause text (`exit <code>`, `exit <SIGNAL>`, `could not start (<message>)`), the summary line for each outcome including `<name> - skipped` (Requirements 5, 6, 9, 10, 14), and the failure block: header, the omitted-lines marker when the output is over 200 lines, then the last 200 lines, or `(no output)` when nothing was captured (UI design 3, 6, 7). Lines are counted by splitting the buffered output on newlines after dropping one trailing newline, so output ending in a newline does not gain an empty last line; output that is empty or only whitespace counts as no output.
   - When the tool list is empty, print `check:diff: no checks apply to the changed files` and exit 0 (Requirement 15). Leave the clean-tree path at `scripts/check-diff.mjs:20-23` unchanged (Requirement 17).
   - Otherwise print the start line naming the checks in run order (UI design 5).
   - Default mode: start every check at once, print each failing check's block when its promise settles, and await them all (Requirements 1, 2, 3).
   - `--seq` mode: run checks one at a time, print the block of the first failure, and record every later check as skipped without spawning it (Requirements 12–14).
   - Print a blank line, one summary line per check in run order, then `total: <ms>ms`, all on stdout (Requirements 4, 20; UI design 9). Set `process.exitCode` to 1 if any check failed and 0 otherwise, replacing the `process.exit(anyFailed ? 1 : 0)` at `scripts/check-diff.mjs:116` (Requirements 18, 19; see Design decisions).
   - Update the header comment at `scripts/check-diff.mjs:2-6` so it describes the real behavior: concurrent by default, buffered output printed for failures, `--seq` sequential and fail-fast.

## UI design

1. The surface is the terminal output of `check-diff`: today a blank line, then one `name ✓|✗ (Nms)` entry per check on a single line, then `total: Nms` (`scripts/check-diff.mjs:108-112`).
2. Placement: a failing check's output block is printed the moment that check finishes, so an early failure shows while slower checks still run. The summary is printed last, after a blank line. User answer: "As each fails".
3. Layout of a failure block: a header line `--- <name> ✗ <cause>: <command> ---`, where `<cause>` is the same `exit <code>`, `exit <SIGNAL>`, or `could not start (<message>)` text the summary uses, followed by the check's captured output. User answer, chosen preview: "--- tsc ✗ exit 2: npm run typecheck:diff ---".
4. In `--seq` mode the single failing check's block is printed the same way, before the summary.
5. Busy state: before any check starts, one line names the checks about to run, in run order, e.g. `check:diff: running lint, tsc, test:server`. Nothing else prints until a failure block or the summary. User answer: "One start line".
6. Failed-with-no-output state: when a failing check captured no output, its block is the header line followed by `(no output)`. User answer, chosen preview: "(no output)".
7. Overflow state: a failure block prints at most the last 200 lines of the check's output. When lines were dropped, a `(… <N> earlier lines omitted)` line comes first, directly under the header. User answer: "Last 200 lines — print the tail with a `(… N earlier lines omitted)` marker".
8. Visual consistency: all output is plain text with no colour codes added by check-diff, matching today's summary and the plain `lint-files:` messages in `scripts/lint-files.mjs`. check-diff does not set `FORCE_COLOR` or any other colour switch for its checks. User answer: "Plain text".
9. Streams: the start line, every failure block, and the summary are all written to stdout, so one capture keeps them in order. User answer: "All to stdout".
10. Interaction, keyboard, and accessibility: unchanged. check-diff is still a one-shot command started with `$janissary/scripts/run.mjs check-diff` (optionally `--seq`); it adds no flags, prompts, or key bindings. Each failing or skipped line spells out its status in text beside the mark (`exit 2`, `could not start`, `skipped`), so the ✗ and - marks are never the only signal.
11. A full failing run in the default mode looks like this:

        check:diff: running lint, tsc, test:server
        --- tsc ✗ exit 2: npm run typecheck:diff ---
        src/a.ts(3,1): error TS2304: Cannot find name 'x'.

        lint ✓ (812ms)
        tsc ✗ (4210ms) exit 2: npm run typecheck:diff
        test:server ✓ (9120ms)
        total: 9131ms

12. The same failure with `--seq` looks like this:

        check:diff: running lint, tsc, test:server
        --- tsc ✗ exit 2: npm run typecheck:diff ---
        src/a.ts(3,1): error TS2304: Cannot find name 'x'.

        lint ✓ (812ms)
        tsc ✗ (4210ms) exit 2: npm run typecheck:diff
        test:server - skipped
        total: 5030ms

## Tests

No automated tests are added. The user chose "No tests, one file": `scripts/check-diff.mjs` stays a top-level script with no exports, so there is no unit to import, and no end-to-end test is written. Every requirement is confirmed instead by the manual checks in Verification.

## Out of scope

Per the user's scope answer ("Minimal fix"):

- Per-check timeouts.
- A cap on how many checks run in parallel. At most five checks exist, so all of them start at once; ESLint and vitest already spread their own work across cores. If CPU contention ever makes the concurrent run slower than `--seq`, the upgrade path is a small fixed limit on running checks.
- New, removed, or renamed checks.
- Changes to `scripts/lint-files.mjs`, `scripts/changed-files.mjs`, or the npm scripts check-diff calls (`typecheck:diff`, `test:diff:server`, `test:diff:web`, `test:server`).
- A new spec file under `product/specs/`.
- Signal handling for an interrupted check-diff (see Design decisions).
- Automated tests for check-diff (see Tests).
- `AGENTS.md`. Its "**File size limit**: `max-lines` max 200 lines" bullet (`AGENTS.md:16`) names no scope and stays as it is, even though `scripts/` becomes exempt (user answer: "Leave AGENTS.md alone").

## Verification

1. `$janissary/scripts/run.mjs check-diff`
2. Because this change edits `scripts/check-diff.mjs` itself, run the edited copy with `./scripts/run.mjs check-diff` for the manual checks below, per `AGENTS.md` "Running scripts".
3. **Concurrency and a green run.** With only the plan's changes in the tree (they touch `scripts/`), run `./scripts/run.mjs check-diff`. Expect `check:diff: running lint, test:server`, no check output, a blank line, `lint ✓ (…ms)` and `test:server ✓ (…ms)` on separate lines, and a `total:` clearly below the sum of the two times. A total at or above the sum means the checks still run sequentially.
4. **Failure output.** Add a type error to any file under `src/` (for example, a reference to an undeclared name), run `./scripts/run.mjs check-diff`, and expect a `--- tsc ✗ exit 2: npm run typecheck:diff ---` block holding the tsc error printed before the summary, a `tsc ✗ (…ms) exit 2: npm run typecheck:diff` summary line, and exit status 1 (`echo $?`). A bare `tsc ✗` with no block, or exit status 0, is a failure. Revert the type error.
5. **Fail-fast `--seq`.** With the same type error, run `./scripts/run.mjs check-diff --seq`. Expect the tsc block, `tsc ✗ …`, and `test:server - skipped`; the server tests must not run (no vitest process, and the total is short). Revert the type error.
6. **Could not start.** Make a directory holding only symlinks to `node` and `git` (git is needed to list the changed files), run `env PATH=<that directory> ./scripts/run.mjs check-diff` with a `src/` change in the tree, and expect each npm-backed check to read `… ✗ (…ms) could not start (spawn npm ENOENT): npm run …`, with a `(no output)` block, and exit status 1.
7. **No checks apply.** Run this after the implementation is committed (stashing it instead would also stash the edited `scripts/check-diff.mjs`). With an otherwise clean tree, create an untracked `product/plans/draft/tmp-note.md`, and run `./scripts/run.mjs check-diff`. Expect exactly `check:diff: no checks apply to the changed files` and exit status 0. Delete the file. With a clean tree, expect `check:diff: no changes` and exit status 0.
8. **Line limit.** Run `npx eslint --print-config scripts/check-diff.mjs` and confirm its `max-lines` entry is off (`0` or `"off"`), then run `npx eslint --print-config src/commands.ts` and confirm `max-lines` is still `error` with `max: 200`. A `src/` file with `max-lines` off means the override's glob is too broad.
