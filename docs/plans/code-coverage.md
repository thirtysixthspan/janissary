# Code Coverage Assessment Plan

## Current State

| Aspect | Server (`src/`) | Client (`web/src/`) |
|---|---|---|
| Test framework | Vitest v4.1.9 | None |
| Test files | 44 files | 0 files |
| Coverage tool | None | None |
| Coverage package | Not installed | Not installed |
| Config | Root `vitest.config.ts` (6 lines) | None |
| Environment | Node.js | N/A |

## Tool Selection

No new tool needed. **Vitest's built-in v8 coverage** is the optimal choice:

| Factor | v8 coverage | Istanbul coverage |
|---|---|---|
| Runtime cost | ~10% overhead (JIT-level) | ~300% overhead (instrumentation) |
| Setup | Single package install | Single package install |
| Accuracy (Vitest ≥3.2) | ✅ AST-remapped, identical to Istanbul | ✅ Battle-tested since 2012 |
| Requirement | Node.js (V8 engine) | Any JS runtime |
| License | MIT | MIT |

v8 is recommended because: already on Node.js, faster, less memory, and since Vitest v3.2 the AST remapping produces identical results to Istanbul.

---

## Phase 1 — Install Coverage Package

```bash
npm install --save-dev @vitest/coverage-v8
```

---

## Phase 2 — Vitest Workspace (Separate Server + Client)

Convert to a Vitest workspace so server and client can be tested with different environments and run independently.

### 2.1 Root `vitest.workspace.ts`

```ts
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  './vitest.server.config.ts',
  './vitest.client.config.ts',
]);
```

### 2.2 Server config — `vitest.server.config.ts`

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'server',
    root: '.',
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['**/.janissary/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'lcov'],
      reportsDirectory: 'coverage/server',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/test/**',
      ],
      thresholds: {
        lines: 40,
        functions: 35,
        branches: 30,
        statements: 40,
      },
    },
  },
});
```

### 2.3 Client config — `vitest.client.config.ts`

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'client',
    root: '.',
    environment: 'jsdom',
    include: ['web/src/**/*.test.{ts,tsx}'],
    setupFiles: ['web/src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'lcov'],
      reportsDirectory: 'coverage/client',
      include: ['web/src/**/*.{ts,tsx}'],
      exclude: [
        'web/src/**/*.test.{ts,tsx}',
        'web/src/**/*.spec.{ts,tsx}',
        'web/src/test/**',
      ],
    },
  },
});
```

Install jsdom for the client test environment:

```bash
npm install --save-dev jsdom
```

### 2.4 Client test setup — `web/src/test/setup.ts`

```ts
// Minimal test setup for React components. Extend as tests are added.
import '@testing-library/react'; // if using RTL later
```

---

## Phase 3 — npm Scripts

```json
{
  "scripts": {
    "test": "vitest run",
    "test:server": "vitest run --project server",
    "test:client": "vitest run --project client",
    "test:watch": "vitest",

    "coverage": "vitest run --coverage",
    "coverage:server": "vitest run --project server --coverage",
    "coverage:client": "vitest run --project client --coverage",

    "coverage:report": "npm run coverage:server && npm run coverage:client",
    "coverage:thresholds": "vitest run --coverage --coverage.thresholds.lines 40"
  }
}
```

Usage:

| Command | What it does |
|---|---|
| `npm run coverage` | Run all tests with coverage, single report |
| `npm run coverage:server` | Server tests only, coverage in `coverage/server/` |
| `npm run coverage:client` | Client tests only, coverage in `coverage/client/` |
| `npm run coverage:report` | Both separately, two reports |

---

## Phase 4 — Outputs & Reports

Each run produces:

| File | Purpose |
|---|---|
| `coverage/{server,client}/index.html` | Interactive HTML report (open in browser) |
| `coverage/{server,client}/coverage-final.json` | Machine-readable for CI scripts |
| `coverage/{server,client}/lcov.info` | LCOV for IDE plugins / Codecov |
| Terminal output | Text summary (printed to stdout) |

---



## Phase 6 — Refactoring Guidance from Coverage

Coverage data reveals which code paths are untested and therefore riskier to refactor:

| Coverage signal | What it means | Action |
|---|---|---|
| File with < 30% coverage | Untested, high refactoring risk | Add tests before touching |
| Branch coverage << line coverage | Missing edge cases | Add tests for conditional paths |
| High FTA score + low coverage | Complex AND untested | Highest priority refactoring target |
| 100% coverage file | Well-tested | Lower risk to refactor |

A `scripts/coverage-guidance.ts` script cross-references coverage JSON (from `coverage-final.json`) with FTA quality scores (from `docs/quality/*.json`) to produce a ranked refactoring priority list:

```
Priority 1 — Controller (controller.ts)
  FTA score: 61.6 (highest complexity)
  Coverage:  22% lines, 15% branches
  Risk:      High — complex untested code is fragile
  Action:    Write tests first, then refactor

Priority 2 — Tab management (tab.ts)
  FTA score: 38.2
  Coverage:  0% lines
  Risk:      Medium — untested utility functions
  Action:    Add unit tests
```

---

## Directory Layout

```
vitest.workspace.ts
vitest.server.config.ts
vitest.client.config.ts
coverage/
├── server/
│   ├── index.html
│   ├── coverage-final.json
│   └── lcov.info
└── client/
    ├── index.html
    ├── coverage-final.json
    └── lcov.info
web/src/test/
    └── setup.ts
scripts/
    └── coverage-guidance.ts     # cross-ref coverage + FTA scores
```

---

## Summary

| Layer | Tool | What it provides | Frequency |
|---|---|---|---|
| Run tests | Vitest (existing) | Pass/fail per test file | On demand |
| Coverage | `@vitest/coverage-v8` | Line/branch/function/statement % + HTML reports | Per-sprint |
| Thresholds | Vitest coverage config | Exits non-zero when coverage drops | On demand |
| Refactoring guidance | `scripts/coverage-guidance.ts` | Ranked priority list cross-referencing coverage + complexity | Weekly / per-sprint |
| Threshold tightening | Manual updates | Ratchet coverage targets upward over time | Monthly |
