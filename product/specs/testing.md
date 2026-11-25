# Automated testing

### Server durable-history isolation

Running unrelated controller tests leaves existing project ACP history unchanged, including open sessions and expired records. Tests use isolated scratch projects and await shutdown before removing their storage. Tests that depend on the checkout's working directory preserve those directory semantics while isolating record storage.

Dedicated recorder and controller persistence tests continue to exercise real storage in scratch projects, including startup crash recovery, shutdown persistence, and expiry. See [[acp-records]].

Tests that deliberately break the system schedule store capture `process.stderr` and assert the reported error, so the expected failure line stays out of suite output without dropping coverage of the runtime report.

System schedule storage integration checks run against real scratch projects and real git repositories. They cover complete snapshot round-tripping, malformed and future-version stores, atomic replacement failure cleanup, local git excludes in nested paths with spaces, tracked targets, already-ignored rules, and symlinked storage. A repeated-startup-cleanup check confirms that persisted schedules and runscripts survive two startup cleanups while a per-run sentinel is removed by the cleanup.

### Client test isolation

Client tests run with a DOM environment and isolated module state for each test file. The DOM environment is prepared once per worker and reused across its files. Cleanup removes rendered React trees after each test.

Canvas contexts are unavailable throughout the client suite: requesting one returns `null`, so code that measures text or captures image frames takes its existing no-canvas fallback. This keeps jsdom's unimplemented-canvas warning out of test output without requiring a native canvas package, and tests that need drawing behavior supply their own fake context.

Media playback is stubbed the same way: `play()` resolves to a settled promise, so jsdom's unimplemented-media warning stays out of test output while the application's promise-based handling still works. Tests that need specific playback behavior supply their own override.

Canvas encoding is stubbed the same way: `toDataURL()` returns a minimal PNG data URL, so an image or video save keeps its intent payload valid and jsdom's unimplemented-canvas-encoder warning stays out of test output. Tests that assert the actual encoded bytes supply their own override.

### Pull request CI

Every pull request against `master` runs four checks in `.github/workflows/ci.yml`, each a separate job that installs dependencies with `npm ci` first. `typescript` runs `npm run typecheck`, `lint` runs `npm run lint`, `tests` runs `npm run test`, and `build` runs `npm run build`, the production server and web build. The build job catches a broken Vite config, asset plugin, or alias that typecheck and tests don't exercise. `scripts/ci-workflow.test.mjs` fails when any of the four jobs or its command goes missing.

### Diff-scoped check runner

The diff-scoped check picks its checks from the changed paths: lint for lintable files, typecheck for `src/` or `web/`, server tests for `src/` or `scripts/`, web tests for `web/`, and the help tests for changed help Markdown. A check the diff does not need never runs. On a clean tree it prints `check:diff: no changes`; when files changed but no check applies, it prints `check:diff: no checks apply to the changed files`. Both exit 0.

Otherwise it prints one start line naming the checks in run order, for example `check:diff: running lint, tsc, test:server`. By default every check starts at once, so the total is roughly the slowest check rather than their sum. Passing checks stay silent. A failing check prints its buffered output as one block the moment it finishes, under a header like `--- tsc ✗ exit 2: npm run typecheck:diff ---`. The block holds the check's combined output, capped at the last 200 lines with a `(… N earlier lines omitted)` marker when lines were dropped, or `(no output)` when the check printed nothing.

The summary comes last: a blank line, one line per check in run order, then `total: Nms`. A passing line reads `lint ✓ (812ms)`. A failing line names the cause and the command to rerun, for example `tsc ✗ (4210ms) exit 2: npm run typecheck:diff`. A check killed by a signal uses `exit SIGKILL` in place of the code; one that cannot start uses `could not start (spawn npm ENOENT)`. The lint check's command is shown as `$janissary/scripts/run.mjs lint-files`. All output goes to stdout. The run exits 0 only when every check passed, and 1 if any failed.

With `--seq` the checks run one at a time and the run stops at the first failure. That failure's block prints before the summary, and every check after it is reported as `<name> - skipped` without a timing. The rerun commands are the npm invocations a user would type, such as `npm run typecheck:diff` or `npm run test:server -- src/commands.test.ts`.

### Diff-scoped help tests

When a Markdown file under `help/` changes, the diff-scoped check runs `src/commands.test.ts` in the server project. That test reads the command table and help pages directly, so it covers help changes that Vitest's changed-source dependency detection cannot associate with a test file.
