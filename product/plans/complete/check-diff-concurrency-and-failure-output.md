# fix(scripts): run check-diff checks concurrently and show failure output

**Complexity: 6/10** — 22 requirements, ~115 added lines, 11 output scenarios across one script and the lint config (p=6.25)

## Goal

`check-diff` runs the applicable lint, typecheck, and test commands concurrently so contributors can get feedback sooner. It reports each failure with the reason, output, and command to rerun. `--seq` stops at the first failure for debugging.

## Requirements

1. In the default mode, the runner starts every selected check without waiting for another to finish. Feature text: "Use execFile/spawn with real promises".
2. A failing check prints its combined stdout and stderr after it finishes, with the display capped at the last 200 lines. User answers: "Failures only — buffer each check's stdout+stderr; when it finishes, print its full output under a header only if it failed" and "Last 200 lines — print the tail with a `(… N earlier lines omitted)` marker".
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
16. Changed paths select the checks. Lintable paths select `lint`, `src/` or `web/` select `tsc`, `src/` or `scripts/` select `test:server`, `web/` selects `test:web`, and help Markdown selects `test:help`. User answer: "Keep: which checks run for which changed paths … Must not: run a check the diff doesn't need".
17. A clean working tree still prints `check:diff: no changes` and exits 0. User answer: "`check:diff: no changes` + exit 0 on a clean tree".
18. A run with selected checks exits 0 when every check passed. User answer: "exit 0 iff all pass, else 1".
19. The run exits 1 when any check failed, including a check killed by a signal or one that could not start; it must never exit 0 when any check failed. User answer: "Must not: … exit 0 on any failure"; "Overall run exits 1".
20. The summary still ends with a `total: <ms>ms` line. User answer: "per-check ms and `total:` line".
21. `scripts/**/*.mjs` files are exempt from the `max-lines` lint rule. User answer: "scripts should not need to follow file length rule"; "Exempt scripts/ in config".
22. `ai/guidelines/code-guidelines.md` states that `scripts/` is exempt from the 200-line limit. User answer: "a one-line note in ai/guidelines/code-guidelines.md that scripts/ is exempt".

## Design decisions

- The runner launches checks with asynchronous `spawn` calls and awaits their promises together in default mode.
- `runCheck` appends each child's stdout and stderr to one buffer in arrival order. The first `close` or `error` determines its outcome and elapsed time. `settle` prints the failure block before resolving, so the `settled` flag suppresses the `close` that can follow a spawn `error`. This keeps the startup error as the only report for that check. The complete buffer stays in memory and the 200-line cap applies when printing (user answer: "spawn + one buffer").
- Each failing check prints one contiguous block as soon as it settles. Passing checks keep their buffered output hidden (user answer: "Failures only").
- A check's display command is its executable and arguments joined with spaces, which already gives the npm forms in Requirement 8. Only the `lint` check carries an explicit display string, `$janissary/scripts/run.mjs lint-files`, because what it spawns is `node` with an absolute path (Requirement 7).
- check-diff adds no SIGINT or SIGTERM handling. Ctrl-C in a terminal reaches the whole foreground process group, and a signal sent only to check-diff may leave its checks running (user answer: "Leave to the OS").
- `--seq` awaits each check before starting the next and skips the remaining checks after the first failure (user answer: "Sequential + fail-fast").
- The runner sets `process.exitCode` after the summary so a long failure block can flush to piped stdout before the process ends. The clean-tree and no-applicable-checks paths print one line and exit 0 immediately.
- All logic stays in `scripts/check-diff.mjs` as a top-level script with no exports (user answer: "No tests, one file").
- `scripts/**/*.mjs` is exempt from `max-lines` in `eslint.config.mjs` so the runner can grow past 200 lines. The code guidelines record the exemption and the testing spec describes the runner's output (user answer: "Exempt scripts/ in config").
- Verification uses the manual checks below (user answer: "No tests, one file").

## Preserved behavior

None found. The behaviors the user named as preserved (check selection, the clean-tree message, the exit status, the timings) have no existing test pinning them, and the user chose to add no tests, so they are recorded as Requirements 16–20 and confirmed by manual checks in Verification.

## Assumptions

1. Check selection uses the current working tree. `scripts/changed-files.mjs:15` runs `git diff HEAD`, and line 16 includes untracked, non-ignored files.
2. The wrapper reports the typecheck process's actual exit code. `package.json:45` defines `typecheck:diff` as incremental TypeScript checks, and `scripts/check-diff.mjs:119` formats the received code as `exit <code>`.
3. The server Vitest project includes script tests. `vitest.config.ts:14` lists `scripts/**/*.test.mjs`.
4. The default ESLint limit is 200 lines. `eslint.config.mjs:62` sets `max-lines` before the script override at lines 119–123.

## Existing functionality

1. Changed-file detection: `scripts/changed-files.mjs:8` "`export function changedFiles()`".
2. Script-relative path resolution for the lint helper: `scripts/check-diff.mjs:15` "`const LINT_FILES = scriptPath('lint-files.mjs');`".
3. Help-markdown change detection: `scripts/check-diff.mjs:33` "`const touchesHelp = hasHelpMarkdownChanges(files);`".
4. Precedent for a per-path override that switches `max-lines` off: `eslint.config.mjs:116-117` "`files: ['**/*.test.ts', '**/*.test.tsx'],`" / "`rules: { 'max-lines': 'off' },`".

## Implementation steps

1. **Exempt scripts from the line limit.** The config block in `eslint.config.mjs` turns `max-lines` off for `scripts/**/*.mjs`. The File Size section of `ai/guidelines/code-guidelines.md` records the exemption. Build command: `$janissary/scripts/run.mjs check-diff`.

2. **Run and report checks.** `scripts/check-diff.mjs` uses the existing path tests and describes each selected check with a name, executable, arguments, and rerun command. Build command: `$janissary/scripts/run.mjs check-diff`.
   - The runner exits early for a clean tree or a diff with no applicable checks. Otherwise it prints a start line listing the checks in run order.
   - `runCheck` spawns the child and records elapsed time, captured output, and the outcome. Its guard prevents a second report if a spawn error is followed by `close`.
   - `printFailure` writes the header and up to the last 200 lines, with a marker when earlier lines were omitted. Line counting drops one trailing newline. Empty or whitespace-only output renders as `(no output)`.
   - Default mode starts all selected checks and awaits them together. `--seq` starts one at a time and records the checks after the first failure as skipped.
   - `summaryLine` formats each result in run order. The summary begins after a blank line and ends with `total: <ms>ms`. The runner sets `process.exitCode` to 1 if any check failed and 0 otherwise.
3. **Describe the runner.** `product/specs/testing.md` records check selection, output, exit status, and fail-fast behavior. The PR description explains that the line-limit exemption gives the runner room to grow and points to the guideline and spec. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. The terminal output starts with the selected checks and ends with one summary line per check followed by `total: Nms` (`scripts/check-diff.mjs:127–158`).
2. Placement: a failing check's output block is printed the moment that check finishes, so an early failure shows while slower checks still run. The summary is printed last, after a blank line. User answer: "As each fails".
3. Layout of a failure block: a header line `--- <name> ✗ <cause>: <command> ---`, where `<cause>` is the same `exit <code>`, `exit <SIGNAL>`, or `could not start (<message>)` text the summary uses, followed by the check's captured output. User answer, chosen preview: "--- tsc ✗ exit 2: npm run typecheck:diff ---".
4. In `--seq` mode the single failing check's block is printed the same way, before the summary.
5. Busy state: before any check starts, one line names the checks about to run, in run order, e.g. `check:diff: running lint, tsc, test:server`. Nothing else prints until a failure block or the summary. User answer: "One start line".
6. Failed-with-no-output state: when a failing check captured no output, its block is the header line followed by `(no output)`. User answer, chosen preview: "(no output)".
7. Overflow state: a failure block prints at most the last 200 lines of the check's output. When lines were dropped, a `(… <N> earlier lines omitted)` line comes first, directly under the header. User answer: "Last 200 lines — print the tail with a `(… N earlier lines omitted)` marker".
8. Visual consistency: all output is plain text with no colour codes added by check-diff, matching today's summary and the plain `lint-files:` messages in `scripts/lint-files.mjs`. check-diff does not set `FORCE_COLOR` or any other colour switch for its checks. User answer: "Plain text".
9. Streams: the start line, every failure block, and the summary are all written to stdout, so one capture keeps them in order. User answer: "All to stdout".
10. Interaction, keyboard, and accessibility: unchanged. check-diff is still a one-shot command started with `$janissary/scripts/run.mjs check-diff` (optionally `--seq`); it adds no flags, prompts, or key bindings. Each failing or skipped line spells out its status in text beside the mark (`exit 2`, `could not start`, `skipped`), so the ✗ and - marks are never the only signal.
11. A default run with a typecheck exit code of 2 looks like this, with the npm prelude omitted:

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

No automated tests were added. The manual checks in Verification cover the runner's output and exit status, including a startup error that produces a single failure block.

## Out of scope

Per the user's scope answer ("Minimal fix"):

- Per-check timeouts.
- A cap on how many checks run in parallel. The runner starts all selected checks, up to five.
- New, removed, or renamed checks.
- Changes to `scripts/lint-files.mjs`, `scripts/changed-files.mjs`, or the npm scripts check-diff calls (`typecheck:diff`, `test:diff:server`, `test:diff:web`, `test:server`).
- A new spec file under `product/specs/`.
- Signal handling for an interrupted check-diff (see Design decisions).
- Automated tests for check-diff (see Tests).
- `AGENTS.md`. Its "**File size limit**: `max-lines` max 200 lines" bullet (`AGENTS.md:16`) names no scope and stays as it is, even though `scripts/` becomes exempt (user answer: "Leave AGENTS.md alone").

## Verification

1. `$janissary/scripts/run.mjs check-diff`
2. Run the manual checks from a clean checkout of the feature branch with dependencies installed. Use `./scripts/run.mjs check-diff` to exercise this checkout's runner.
3. **Concurrent and sequential passes.** Create `scripts/__check_diff_probe.mjs` with `console.log('probe');`. Run `./scripts/run.mjs check-diff` and then `./scripts/run.mjs check-diff --seq`. Both list `lint, test:server`, print separate `✓` lines and a total, and exit 0 with the child output hidden. The concurrent run overlaps the checks. Remove the probe.
4. **Failure output.** Create `src/__check_diff_probe.ts` containing `export const probe: number = 'x';`. Run `./scripts/run.mjs check-diff`. Expect `error TS2322` inside the `tsc` block, the same child exit code and `npm run typecheck:diff` in the header and summary, and wrapper exit status 1. The compiler exit code can vary with incremental state.
5. **Fail-fast `--seq`.** Keep the type probe and run `./scripts/run.mjs check-diff --seq`. Expect the `tsc` failure block and `test:server - skipped` with no duration. The wrapper exits 1. Remove the probe.
6. **Could not start.** Recreate the probe with `export const probe: number = 1;`. Use a scratch `PATH` with symlinks to `node` and `git` and run `env PATH=<that directory> ./scripts/run.mjs check-diff`. Expect one block per unavailable npm-backed check with `could not start (spawn npm ENOENT)` and `(no output)`. The wrapper exits 1. Remove the probe and scratch directory.
7. **Signals and long output.** Follow the PR description's scratch command steps. A child killed by `SIGKILL` reports `exit SIGKILL` with `(no output)`. A child that prints 250 lines numbered 0 through 249 before exiting nonzero reports `(… 50 earlier lines omitted)` followed by lines 50 through 249. Both runs exit 1.
8. **No checks apply.** Create an untracked `product/plans/draft/tmp-note.md` and run `./scripts/run.mjs check-diff`. Expect exactly `check:diff: no checks apply to the changed files` and exit status 0. Remove the file and rerun. Expect exactly `check:diff: no changes` and exit status 0.
9. **Line limit.** Run `npx eslint --print-config scripts/check-diff.mjs` and `npx eslint --print-config src/commands.ts`. The script's `max-lines` severity is 0. The source file's severity is 2 with `max: 200`.
