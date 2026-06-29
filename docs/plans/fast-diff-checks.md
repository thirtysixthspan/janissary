# Fast diff checks for development (`check:diff`)

## Goal

A fast, **change-scoped** version of the lint + typecheck + test checks for the inner development
loop, so a change can be verified in seconds instead of running the whole `check` suite each time.
The full `npm run check` stays the end-of-work gate. Includes guidance telling AIs to use the fast
command while working and run the full `check` only once, at the end.

```
npm run check:diff   # lint changed files + typecheck affected projects (incremental) + related tests
npm run check        # full gate — run once when all work is done
```

## Current state

- **Full gate** (`package.json`): `check` = `typecheck` (both tsconfig projects) + `lint`
  (`eslint .`) + `test` (all) + `lint:css` + `quality` (fta) + `duplication` (jscpd) + `knip`.
  Thorough but slow; re-running it after every edit is the pain point.
- **Diff-lint already exists:** `scripts/lint-files.mjs` (`lint:files`) lints only the working
  changes — `git diff --name-only --diff-filter=d HEAD` plus `git ls-files --others
  --exclude-standard` — filtered to lintable extensions. This is the lint half done.
- **Tests:** `vitest` with two projects (`server` = `src/**/*.test`, `client` = `web/src/**/*.test`)
  and `passWithNoTests: true` (`vitest.config.ts`). Vitest supports `--changed` (run only tests
  whose module graph touches the working changes).
- **Typecheck:** `tsc --noEmit -p tsconfig.json` (server, `src/**`) and `-p web/tsconfig.json`
  (web, `web/src` + `@shared/* → ../src/*`). TypeScript is `^6`, so `--incremental` works **with**
  `--noEmit`.

## Design — `check:diff`

Three change-scoped checks over the git working tree (uncommitted + untracked), plus an
orchestrator that computes the change set once and reports a single pass/fail.

### 1. Changed-file detection (shared)
Extract the git logic from `lint-files.mjs` into `scripts/changed-files.mjs` exporting
`changedFiles()`; have `lint-files.mjs` import it (no behavior change) and the orchestrator reuse
it. One source of truth — keeps `jscpd`/`knip` happy.

### 2. Lint — changed files
Reuse `lint:files` (already lints the uncommitted set). The orchestrator can pass it the
precomputed file list to avoid recomputing.

### 3. Typecheck — affected projects, incremental
TypeScript **cannot** typecheck an arbitrary subset of files — it needs the whole program for a
project. Two legitimate speedups instead of file-scoping:
- **Project scoping:** run only the affected project(s):
  - server (`tsconfig.json`) when any non-test `src/**` changed;
  - web (`web/tsconfig.json`) when any `web/**` changed **or** any `src/**` changed (web consumes
    shared types via `@shared/* → ../src/*`, so a server-side type change can break web).
- **Incremental:** `tsc --noEmit --incremental --tsBuildInfoFile <cache>` so repeated runs only
  re-check what moved. Cache under `node_modules/.cache/tsc/{server,web}.tsbuildinfo` (gitignored —
  `node_modules/` is in `.gitignore`).

Add `typecheck:diff` that runs both projects incrementally (simple + always-correct); the
orchestrator may skip an untouched project for extra speed.

### 4. Tests — related only
`test:diff` → `vitest run --changed`: runs only tests whose module graph touches the working
changes, across both projects. `passWithNoTests: true` means a change with no related test passes
immediately. **Coverage thresholds are not enforced here** (coverage runs only in the full gate).

### 5. Orchestrator — `scripts/check-diff.mjs`
- `changedFiles()` once; if empty → print `check:diff: no changes` and exit `0`.
- Classify the set: any lintable files? touches `src/`? touches `web/`?
- Run lint / typecheck / test **concurrently**, buffering each tool's output; print a compact
  summary (`lint ✓  tsc ✓  test ✓` with durations); exit non-zero if any failed. A `--seq` flag
  runs them sequentially (fail-fast) for clearer output when debugging.
- Resolve tool bins relative to the script (as `lint-files.mjs` does) so it works from any cwd.

### package.json scripts
- `typecheck:diff` — incremental tsc on both projects (cache files set).
- `test:diff` — `vitest run --changed`.
- `check:diff` — `node scripts/check-diff.mjs`.
- (optional) `lint:diff` — alias of `lint:files` for naming symmetry.

## Deliberately omitted from `check:diff` (only in full `check`)
`lint:css` (stylelint), `quality` (fta complexity), `duplication` (jscpd), `knip` (dead exports),
the full test suite, and coverage thresholds. These are holistic/whole-tree and belong to the
end-of-work gate, not the per-edit loop. (Changed-file `stylelint` could be added later if CSS
churn warrants it.)

## AI guidance

`AI.md` was removed and there is no `CLAUDE.md`. Create **`CLAUDE.md`** at the repo root (the file
Claude Code auto-loads) with a short **"Verifying changes"** section:

- **During development**, after each change, run `npm run check:diff` for fast feedback — it lints
  the changed files, typechecks the affected project(s) incrementally, and runs the related tests.
- **At the very end of all work**, run the full `npm run check` once. It adds `lint:css`,
  `quality`, `duplication`, `knip`, the full test suite, and coverage thresholds, and checks the
  whole tree — `check:diff` is a fast loop, **not** a substitute for the final gate.
- `check:diff` scopes to the **uncommitted** working tree; committing or reverting mid-task
  rescopes it automatically.

Also add a brief **Development** note in `README.md` pointing to the same two commands, so the
workflow is discoverable to humans too.

## Gotchas
- **No file-level tsc.** tsc needs the whole project program; the speedup is project-scope +
  incremental cache, not file selection.
- **`@shared` coupling.** A `src/**` change can break `web` types → run web tsc when `src/**`
  changed, not only when `web/**` changed.
- **`vitest --changed` blind spots.** A changed source file with no importing test runs no tests
  (passes); the final full `check` is what guarantees the whole suite still passes.
- **Cache location** must be gitignored (`node_modules/.cache/…` qualifies).
- **No git / no HEAD** (fresh clone, initial commit): `changedFiles()` should degrade gracefully
  (treat as "everything" or "nothing" — mirror `lint-files.mjs`'s behavior and document it).

## Verification
Exercise `check:diff` with: no changes (fast exit 0); a lint error (fails); a type error including
a `src` change that breaks `web` types (web tsc fails); a change whose related test fails (fails);
a change with no related test (passes). Time it against `npm run check` to confirm the speedup.

## Checklist
- [ ] `scripts/changed-files.mjs` — extract `changedFiles()`; refactor `lint-files.mjs` to use it
- [ ] `scripts/check-diff.mjs` — orchestrator (no-change shortcut, concurrent + buffered, summary)
- [ ] `package.json` — `typecheck:diff`, `test:diff`, `check:diff` (+ optional `lint:diff`)
- [ ] `CLAUDE.md` — AI workflow: `check:diff` while developing, full `check` only at the end
- [ ] `README.md` — brief Development note (same two commands)
- [ ] Verify the behaviors above; confirm it's meaningfully faster than `check`
