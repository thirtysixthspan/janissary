# Code Coverage Plan

## What changed from the prior draft (and why)

The earlier draft chose the right *tool* (Vitest v8 coverage) but its setup was written for Vitest 1–2 and does not run on the installed version. Verified against this repo (`vitest@4.1.9`):

| Prior draft | Problem | Fix in this plan |
|---|---|---|
| `vitest.workspace.ts` + `defineWorkspace([...])` | `defineWorkspace` was **removed in Vitest 4** (`import('vitest/config').defineWorkspace` → `undefined`). The file is ignored. | Use `test.projects` inside the single root `vitest.config.ts`. |
| Separate `coverage` blocks in `vitest.server.config.ts` and `vitest.client.config.ts`, writing to `coverage/server` and `coverage/client` | `coverage` is a **global option** in Vitest 4 (it is in `NonProjectOptions`). Per-project coverage config is ignored; one run produces **one** merged report, not two. | One global `coverage` block at the root. Use **per-glob thresholds** to gate `src/**` and `web/src/**` separately within the single report. |
| `passWithNoTests` absent; client project has **0** test files | `vitest run --project client` fails with "No test files found". | Set `passWithNoTests: true` (also a global option) so an empty client project is safe. |
| `web/src/test/setup.ts` imports `@testing-library/react` | RTL is **not installed**; the setup file would throw if loaded. | Drop the setup file until the first web test needs it. Don't scaffold RTL speculatively. |
| Thresholds hard-coded to 40/35/30/40 | Guessed, never measured. Could be trivially passed or instantly red. | **Measure the baseline first** (Phase 3), then set thresholds at the measured floor and ratchet up with `thresholds.autoUpdate`. |
| Phase 6 cross-references `docs/quality/*.json` (FTA scores) | FTA is **not installed** and `docs/quality/` does not exist — it is set up by the separate `docs/plans/code-quality.md` plan. | Marked optional and dependent on the code-quality plan (Phase 8). |
| Missing Phase 5 (numbering skipped 4 → 6) | — | Renumbered. |

### Was there a better alternative?

The *strategy* is sound — there is no better tool or architecture, so this is a correction-and-simplification of the existing plan rather than a replacement. Alternatives considered and rejected:

- **Istanbul provider** — 3× runtime overhead vs ~10% for v8, no accuracy benefit since
  Vitest ≥3.2 AST-remaps v8 output. Rejected.
- **Standalone `c8` / `nyc`** — duplicates what `@vitest/coverage-v8` already wires into
  the existing Vitest runner. Rejected.
- **Two independent config files (server + client), run in two passes** — the only way to
  get two *physically separate* report directories, but it doubles config and still can't
  share a merged number. Per-glob thresholds in one config give per-area gating without the
  duplication. Rejected as default; noted as a fallback if physically separate reports are
  ever required.
- **Single merged config with `test.projects` + one global coverage block** — fewer files,
  matches how Vitest 4 actually resolves coverage, and the HTML report already breaks down
  by directory. **Chosen.**

---

## Current State (verified)

| Aspect | Server (`src/`) | Client (`web/src/`) |
|---|---|---|
| Test framework | Vitest 4.1.9 | none |
| Test files | 44 (`src/**/*.test.{ts,tsx}`) | 0 |
| Coverage tool | none (`@vitest/coverage-v8` not installed) | none |
| Test env needed | `node` (esbuild handles JSX — no React plugin) | `jsdom` + `@vitejs/plugin-react` (already a devDep) when tests exist |
| Config | root `vitest.config.ts` (excludes `**/.janissary/**`) | — |

---

## Tool Selection

**Vitest's built-in v8 coverage** (`@vitest/coverage-v8`). Already on Node/V8, ~10% overhead, and since Vitest ≥3.2 the AST-remapped output matches Istanbul. No new runner, no new config system. (Full rationale and rejected alternatives above.)

---

## Phase 1 — Install the coverage provider

```bash
npm install --save-dev @vitest/coverage-v8
```

This is the **only** dependency needed to start. `jsdom` is deferred to Phase 7 (no web tests exist yet, so nothing exercises it).

---

## Phase 2 — Configure projects + one global coverage block

Replace the current `vitest.config.ts` (which only carries the `.janissary` exclusion) with the version below. It keeps that exclusion, adds the `server` project, and configures coverage once at the root. The `client` project is left commented out until Phase 7.

```ts
// vitest.config.ts import { defineConfig, configDefaults, coverageConfigDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    // A project with no matching test files (the web client, until Phase 7) must not
    // fail the run. `passWithNoTests` is a global option in Vitest 4.
    passWithNoTests: true,

    projects: [
      {
        // Node server tests. Vitest's esbuild transform handles JSX, so the
        // React plugin is not needed here.
        test: {
          name: 'server',
          environment: 'node',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: [...configDefaults.exclude, '**/.janissary/**'],
        },
      },

      // --- CLIENT: uncomment when the first web/src test is written (Phase 7) ---
      // {
      //   plugins: [react()],            // import react from '@vitejs/plugin-react'
      //   test: {
      //     name: 'client',
      //     environment: 'jsdom',
      //     include: ['web/src/**/*.test.{ts,tsx}'],
      //     exclude: [...configDefaults.exclude, '**/.janissary/**'],
      //   },
      // },
    ],

    // Coverage is GLOBAL in Vitest 4 (it lives in NonProjectOptions), so it is configured
    // once here and spans every project — a single merged report.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'lcov'],
      reportsDirectory: 'coverage',
      // Listing globs here reports matching files even when no test imports them, so
      // untested code (e.g. all of web/src today) shows as 0% instead of vanishing.
      include: ['src/**/*.{ts,tsx}', 'web/src/**/*.{ts,tsx}'],
      exclude: [
        ...coverageConfigDefaults.exclude,
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/.janissary/**',
        'web/src/main.tsx', // app bootstrap/entry — no logic worth gating
      ],
      // thresholds are added in Phase 4, after measuring the baseline.
    },
  },
});
```

Notes:
- `web/src/**` is intentionally in `coverage.include` *now*, before any client project
  exists, so the report honestly shows the untested UI at 0%.
- Because coverage is global, a filtered run like `vitest run --project server --coverage`
  still reports `web/src` (as 0%). For clean per-area numbers, read the **directory
  breakdown in the HTML report** or use per-glob thresholds (Phase 4) rather than trying to
  split the report.

---

## Phase 3 — Measure the baseline (before setting any threshold)

```bash
npm install --save-dev @vitest/coverage-v8   # if not already done npx vitest run --coverage
```

Record the resulting `% Lines / Functions / Branches / Statements` for `src/` and for `web/src/` from the terminal summary (or `coverage/index.html`). This is the input to Phase 4 — **do not invent thresholds; derive them from this run.**

Expected shape (illustrative — fill in with real numbers):

```
File          | % Stmts | % Branch | % Funcs | % Lines src/          |   <X>   |   <X>    |   <X>   |   <X> web/src/      |    0    |    0     |    0    |    0     (no client tests yet)
```

---

## Phase 4 — Set ratchet thresholds from the baseline

Set each threshold at (or just below) the measured value so the suite locks in current coverage and fails only on **regression**. Use **per-glob thresholds** to gate server and client independently inside the one report, and `autoUpdate` to ratchet upward automatically as coverage improves.

```ts
coverage: {
  // ...provider/reporter/include/exclude from Phase 2...
  thresholds: {
    autoUpdate: true, // raise these numbers in-file whenever coverage rises; never lowers
    'src/**': {
      lines: 0,       // <- replace 0 with the measured server baseline from Phase 3
      functions: 0,
      branches: 0,
      statements: 0,
    },
    'web/src/**': {
      lines: 0,       // stays 0 until Phase 7 adds client tests, then ratchets up
      functions: 0,
      branches: 0,
      statements: 0,
    },
  },
},
```

With `autoUpdate: true`, a green run that exceeds a threshold rewrites the higher number into this file, so coverage can only ratchet up. Review those diffs in code review.

---

## Phase 5 — npm scripts

```jsonc
{
  "scripts": {
    "test": "vitest run",
    "test:server": "vitest run --project server",
    "test:watch": "vitest",

    "coverage": "vitest run --coverage"
    // add "test:client": "vitest run --project client" in Phase 7
  }
}
```

The earlier draft's `coverage:server` / `coverage:client` scripts are dropped: coverage is global, so they would not produce separate reports. One `npm run coverage` yields the merged report; per-area numbers come from its directory breakdown and per-glob thresholds.

---

## Phase 6 — Outputs

A `npm run coverage` run produces:

| Path | Purpose |
|---|---|
| `coverage/index.html` | Interactive report; drills down by directory (`src/` vs `web/src/`) |
| `coverage/coverage-final.json` | Machine-readable; input to optional Phase 8 |
| `coverage/lcov.info` | LCOV for IDE gutters / Codecov |
| terminal text summary | Per-file table on stdout |

Add `/coverage` to `.gitignore` (the report is a build artifact).

---

## Phase 7 — (Deferred) enable client/web testing

Do this only when writing the first `web/src` test — not before.

1. `npm install --save-dev jsdom` (and `@testing-library/react @testing-library/jest-dom`
   only if you choose RTL; `@vitejs/plugin-react` is already a devDep).
2. Uncomment the `client` project block in `vitest.config.ts` (Phase 2) and add
   `import react from '@vitejs/plugin-react';`.
3. Add `"test:client": "vitest run --project client"` to `package.json`. 4. Add a setup file (`web/src/test/setup.ts`) **only if** using RTL/jest-dom matchers, and
   wire it via the client project's `test.setupFiles`. Leave it out otherwise.
5. As real tests land, the `web/src/**` thresholds (Phase 4) ratchet up automatically.

---

## Phase 8 — (Optional) coverage × complexity refactoring guidance

> **Depends on `docs/plans/code-quality.md` being executed first.** That plan installs FTA > (`fta-cli`) and writes `docs/quality/*.json`. Neither exists yet; do not build this phase > until they do.

Once FTA scores exist, `scripts/coverage-guidance.ts` can cross-reference `coverage/coverage-final.json` (line/branch %) with `docs/quality/*.json` (FTA complexity) to rank refactoring targets — complex **and** untested code first:

| Signal | Meaning | Action |
|---|---|---|
| High FTA score + low coverage | Complex and untested | Highest priority — add tests before refactoring |
| Branch % ≪ line % | Missing edge cases | Test the conditional paths |
| < 30% coverage | High refactoring risk | Add tests before touching |
| ~100% coverage | Well covered | Safe to refactor |

```
Priority 1 — controller.ts   FTA 61.6 (highest)   coverage <fill from baseline>
  Action: write tests first, then refactor.
Priority 2 — tab.ts          FTA 38.2             coverage <fill from baseline>
  Action: add unit tests.
```

(FTA numbers above are illustrative, carried from the code-quality plan; replace with the actual `docs/quality/*.json` output.)

---

## Directory Layout (after Phases 1–6)

```
vitest.config.ts          # single config: test.projects + global coverage coverage/                 # gitignored build artifact ├── index.html ├── coverage-final.json └── lcov.info
# added later:
# web/src/test/setup.ts   # only if Phase 7 chooses RTL
# scripts/coverage-guidance.ts  # only after code-quality plan (Phase 8)
```

---

## Summary

| Layer | Tool | Provides | When |
|---|---|---|---|
| Run tests | Vitest 4 (existing) | pass/fail per file | on demand |
| Projects | `test.projects` (server now, client in Phase 7) | per-env test runs (node / jsdom) | once |
| Coverage | `@vitest/coverage-v8` (global block) | line/branch/func/stmt % + HTML, merged report | per run |
| Gating | per-glob `thresholds` + `autoUpdate` | fails on regression for `src/**` and `web/src/**` separately; ratchets up | CI / on demand |
| Guidance (optional) | `scripts/coverage-guidance.ts` | coverage × FTA refactor ranking | after code-quality plan |
```