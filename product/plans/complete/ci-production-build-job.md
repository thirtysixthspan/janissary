# Add a production build job to pull request CI

**Complexity: 2/10** — ~10 added workflow lines in 1 file, 4 requirements, 2 test scenarios (p=3.93)

## Goal

Pull request CI runs typecheck, lint, and tests, but never the production build. A broken Vite config, a failure in the PDF.js asset plugin, or a missing alias can therefore merge green and only show up when someone runs `npm run build`. This change adds a `build` job to the CI workflow so every pull request against `master` runs the same production build a release does.

## Requirements

1. The CI workflow has a job that runs `npm run build`. From the issue: "Nothing exercises npm run build (tsc && vite build) ... Add a build job to CI."
2. The build job installs dependencies with `npm ci` before building, the same way the existing jobs do.
3. The build job runs on the same trigger as the other jobs, a pull request against `master`, because it is a job in the same workflow.
4. A test fails when the CI workflow no longer has a job that runs `npm run build`.

## Design decisions

- Add a fourth job named `build` to `.github/workflows/ci.yml`, rather than appending a build step to an existing job. The workflow already keeps one concern per job (`typescript`, `lint`, `tests`), and a separate job gives the build its own pass/fail check on the pull request.
- Reuse the existing job shape exactly: `ubuntu-latest`, `actions/checkout@v7`, `actions/setup-node@v7` with Node 24 and npm cache, then `npm ci`. Only the final `run` step differs. See Assumption 1.
- Run `npm run build`, the package script, rather than calling `tsc` and `vite build` directly, so CI follows the script if it changes. See Assumption 2.
- Pin the requirement with a test under `scripts/` that reads the workflow file as text. No YAML parser is a direct dependency, and the test only needs to find one job block and its steps. See Assumption 3.

## Preserved behavior

1. The existing `typescript`, `lint`, and `tests` jobs keep running `npm run typecheck`, `npm run lint`, and `npm run test`. The new test must not accept a workflow where adding `build` removed or renamed one of them; it asserts all four jobs and their commands. No existing test pins this today, so the new test in `scripts/ci-workflow.test.mjs` covers it.

## Assumptions

1. Every existing CI job uses the same setup steps: `.github/workflows/ci.yml:17` "`- uses: actions/checkout@v7`", `.github/workflows/ci.yml:18` "`- uses: actions/setup-node@v7`", `.github/workflows/ci.yml:22` "`- run: npm ci`".
2. The production build is the `build` package script: `package.json:9` "`\"build\": \"tsc && npm run build:web\"`".
3. Tests under `scripts/` run in the server Vitest project: `vitest.config.ts:14` "`include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs']`".
4. The build passes on current `master`: `npm run build` completes with only the advisory chunk-size warning, which does not fail the build.

## Existing functionality

1. The workflow trigger and concurrency group already apply to every job in the file: `.github/workflows/ci.yml:3` "`on:`" with `pull_request` on `master`.
2. Scripts tests that read repo files with `node:fs` and resolve paths from the repo root: `scripts/vite-config.test.mjs:5` "`const CONFIG_FILE = path.resolve('web/vite.config.ts');`".

## Implementation steps

1. Add a `build` job to `.github/workflows/ci.yml` after `tests`, with `name: build` and the same checkout, setup-node, and `npm ci` steps as the other jobs, ending in `- run: npm run build`. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Add `scripts/ci-workflow.test.mjs`. It reads `.github/workflows/ci.yml`, splits the `jobs:` section into blocks by their two-space-indented job keys, and asserts each expected job (`typescript`, `lint`, `tests`, `build`) exists, runs `npm ci`, and runs its command. Build command: `$janissary/scripts/run.mjs check-diff`.
3. Add a short section to `product/specs/testing.md` describing the pull request CI jobs. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The change adds a CI job and a test; it changes nothing a user sees in the app. On GitHub, a pull request shows one more check, named `build`.

## Tests

- `scripts/ci-workflow.test.mjs`: the workflow has a `build` job that runs `npm ci` and then `npm run build` (Requirements 1, 2, 4).
- `scripts/ci-workflow.test.mjs`: the `typescript`, `lint`, and `tests` jobs still run `npm ci` and their commands (Preserved behavior 1).

## Out of scope

- Changing the existing jobs, the trigger, Node version, or action versions.
- Running CI on pushes to `master`.
- Fixing the advisory chunk-size warning the build prints.
- Building the documentation site in CI.

## Verification

Run `$janissary/scripts/run.mjs check-diff`; the new test passes.

Then run `npm run build` locally and confirm it ends with `✓ built` and exits 0, which is what the new job will run. After the pull request opens, its checks list shows a `build` check that passes; a missing `build` check, or one that fails on an unchanged tree, shows the job was not added correctly.
