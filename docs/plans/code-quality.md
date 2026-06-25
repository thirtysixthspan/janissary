# Code Quality Assessment Plan

## Tool Selection

After evaluating available free, local TypeScript code quality tools, **FTA (Fast TypeScript Analyzer)** is the best fit for this repository.

| Tool | Stars | Downloads/wk | Metrics | Score | License |
|---|---|---|---|---|---|
| **FTA** (fta-cli) | 324 | 147k | Cyclo, Halstead, LOC | FTA Score (0-100) + assessment | MIT |
| Codopsy-ts | 0 | — | Cyclo + cognitive, 47 rules | A–F grade | MIT |
| Qualitas | new | — | 5-pillar (cognitive, data, coupling) | 0-100 Quality Score | MIT |
| Codexray | 1 | — | 10 rules, god modules, nesting | A–F + refactor plan | MIT |

**Why FTA:**

- **Most mature** — 147k weekly npm downloads, 324 GitHub stars, 281 commits, active since 2023
- **Rust-native** — sub-second analysis of the entire codebase (~70 source files)
- **Multiple metrics** — cyclomatic complexity + Halstead measures (volume, difficulty, effort) + line count + composite FTA Score
- **Per-file assessment** — "OK", "Could be better", "Needs improvement" labels guide refactoring priority
- **Separate runs** — `fta src` for server, `fta web/src` for client
- **CI-ready** — JSON output, configurable score thresholds, non-zero exit on breach
- **Simple integration** — single devDependency, zero config to start

**Also retained:** The existing ESLint + typescript-eslint setup (already covering both `src/` and `web/src/` with type-aware rules) for correctness linting, with one additional plugin for cognitive complexity.

---

## Phase 1 — Install & Baseline

### 1.1 Install FTA

```bash
npm install --save-dev fta-cli
```

### 1.2 Run initial baselines

```bash
npx fta src/ --json > docs/quality/baseline-server.json
npx fta web/src/ --json > docs/quality/baseline-client.json
```

### 1.3 Examine results

Each file gets:
```
{
  "file_name": "src/controller.ts",
  "cyclo": 42,
  "halstead": { "volume": 854, "difficulty": 38, "effort": 32337, "time": 1797, "bugs": 0.28 },
  "line_count": 995,
  "fta_score": 61.6,
  "assessment": "Needs improvement"
}
```

The baseline JSON is committed and serves as the reference point for tracking quality over time.

---

## Phase 2 — ESLint Enhancement

The existing config covers correctness (`no-unused-vars`, `consistent-type-imports`, `no-unsafe-assignment`). Add quality-focused rules:

### 2.1 Install sonarjs plugin

```bash
npm install --save-dev eslint-plugin-sonarjs
```

### 2.2 Add to `eslint.config.mjs`

```js
import sonarjs from 'eslint-plugin-sonarjs';

export default ts.config(
  ...existingConfig,
  sonarjs.configs.recommended,
  {
    rules: {
      'sonarjs/cognitive-complexity': ['warn', 15],
      'sonarjs/no-duplicate-string': ['warn', { threshold: 5 }],
      'sonarjs/max-switch-cases': ['warn', 8],
    },
  },
);
```

This catches what FTA cannot: cognitive complexity (human-perceived difficulty, not just branch paths), duplicate strings, and switch-case bloat.

---

## Phase 3 — npm Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "quality": "npm run quality:server && npm run quality:client",
    "quality:server": "fta src/ --json > docs/quality/server.json; echo '---'; echo 'Server:'; fta src/",
    "quality:client": "fta web/src/ --json > docs/quality/client.json; echo '---'; echo 'Client:'; fta web/src/",
    "quality:baseline": "npm run quality:server && npm run quality:client",
    "quality:check": "npm run quality:server && npm run quality:client",
    "quality:lint": "eslint . --max-warnings 20"
  }
}
```

Usage:
- `npm run quality` — full assessment (server + client), prints summary tables, writes JSON reports
- `npm run quality:check` — exits non-zero if any FTA score exceeds threshold
- `npm run quality:baseline` — re-snapshot baselines after intentional improvements
- `npm run quality:lint` — existing ESLint pass with warning cap

---

## Phase 4 — Refactoring Guidance Script

A small script (`scripts/quality-report.ts`) that processes FTA JSON output and produces a ranked refactoring priority list:

```
Target: src/controller.ts
  FTA Score: 61.6 — Needs improvement
  Cyclomatic complexity: 42 (highest in codebase)
  Halstead difficulty: 38
  Estimated bugs: 0.28
  Recommendation: Split into smaller modules. The controller handles
  tab management, command dispatch, shell execution, ACP sessions,
  browser automation, scheduling, and file opening.

Target: src/tab.ts
  FTA Score: 38.2 — OK
  Cyclomatic complexity: 18 (flattenBuffer)
  Recommendation: The flattenBuffer function handles 7+ entry types.
  Consider extracting per-type formatters.
```

Run with:
```bash
npx tsx scripts/quality-report.ts --threshold 50
```

This gives actionable, ranked refactoring targets grouped by severity.

---




---

## Directory layout

```
docs/
└── quality/
    ├── baseline-server.json    # committed FTA snapshot for src/
    ├── baseline-client.json    # committed FTA snapshot for web/src/
    ├── server.json             # latest run (gitignored)
    └── client.json             # latest run (gitignored)
scripts/
├── quality-report.ts          # ranked refactoring guidance from FTA output
└── check-baseline.ts          # fail if quality regressed vs baseline
```

---

## Summary

| Layer | Tool | What it measures | Frequency |
|---|---|---|---|
| Complexity + score | FTA | Cyclomatic complexity, Halstead metrics, FTA Score (0-100) | On demand / per-sprint |
| Correctness + style | ESLint (enhanced) | Type safety, unused code, cognitive complexity | On demand |
| Trending | Baseline JSON | Track FTA Score over time, prevent regression | Per-milestone comparison |
| Refactoring guidance | quality-report.ts | Ranked hotspot list with recommendations | Weekly / per-sprint |
