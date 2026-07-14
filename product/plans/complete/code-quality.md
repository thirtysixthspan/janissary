# Code Quality Plan

## Current State (measured 2026-06-25)

ESLint is already substantial (`typescript-eslint` type-aware rules, `unicorn/flat/recommended`, `react-hooks`, `import-x`, `eqeqeq`, and **`max-lines` warn at 200**). What it lacks is any **complexity** rule — the one real gap.

FTA distribution (`*.test.*` excluded):

| Scope | Files | Needs improvement | Could be better | OK |
|---|---|---|---|---|
| `src/` (non-test) | 60 | 2 | 6 | 52 |
| `web/src/` | 13 | 0 | 1 | 12 |

Top refactoring targets (non-test, by FTA score):

| File | FTA score | Cyclo | Lines | Assessment |
|---|---|---|---|---|
| `src/controller.ts` | **94.4** | **216** | 815 | Needs improvement |
| `src/tab.ts` | 60.3 | 58 | 200 | Needs improvement |
| `src/schedule.ts` | 59.6 | 61 | 183 | Could be better |
| `web/src/App.tsx` | 58.6 | 60 | 178 | Could be better |
| `src/db.ts` | 55.6 | 39 | 153 | Could be better |
| `src/index.ts` | 54.1 | 34 | 132 | Could be better |
| `src/completion.ts` | 51.6 | 33 | 116 | Could be better |

`controller.ts` is a true outlier — score 94.4 and cyclomatic 216 dwarf everything else. It is the single highest-leverage refactoring target.

---

## Phase 1 — ESLint complexity rules (primary, actionable)

Adds the missing complexity signal to the config the team already uses daily. Surfaces in-editor and in `npm run lint`, with exact line locations.

### 1.1 Install

```bash
npm install --save-dev eslint-plugin-sonarjs@^4.1   # peer: eslint ^8 || ^9 || ^10 (verified vs eslint 10.5)
```

### 1.2 Add to `eslint.config.mjs`

Register the plugin and enable **only** the chosen rules (do **not** spread `sonarjs.configs.recommended` — on this codebase that floods `npm run lint`). Add near the other rule blocks in the existing `ts.config(...)`:

```js
import sonarjs from 'eslint-plugin-sonarjs';

// inside ts.config(...), as a new flat-config object: {
  files: ['src/**/*.ts', 'src/**/*.tsx', 'web/src/**/*.ts', 'web/src/**/*.tsx'],
  ignores: ['**/*.test.ts', '**/*.test.tsx'],
  plugins: { sonarjs },
  rules: {
    'sonarjs/cognitive-complexity': ['warn', 15], // human-perceived difficulty, per function
    'sonarjs/no-duplicate-string': ['warn', { threshold: 5 }],
    'sonarjs/no-identical-functions': 'warn',
  },
},
```

Keep these as `warn`, consistent with how `max-lines` and the unicorn rules are already treated (guidance, not a hard block). `controller.ts` will light up heavily — that is the intended signal, not noise.

> Do not add `--max-warnings N` to `npm run lint` yet: the new warnings make any guessed cap > fail immediately. If a cap is wanted later, measure the count first (`eslint . 2>&1 | tail`) > and set the cap at that floor, ratcheting down as warnings are resolved.

---

## Phase 2 — FTA (optional: trend snapshot + regression gate)

Thin layer — one devDep, no custom scripts.

### 2.1 Install

```bash
npm install --save-dev fta-cli@^3
```

### 2.2 Config — `fta.json` at repo root

```json
{
  "exclude_filenames": ["**/*.test.ts", "**/*.test.tsx"],
  "exclude_directories": ["dist", "web/dist", ".janissary"],
  "score_cap": 95
}
```

- `exclude_filenames` keeps tests out of the signal (verified: 104 → 60 files).
- `exclude_directories` guards against `.janissary` (an ephemeral copy of the source tree)
  or `dist` being analyzed if FTA is ever pointed at the repo root. Running `fta src` /
  `fta web/src` already path-scopes around them; this is belt-and-suspenders.
- `score_cap: 95` is the **real gate** (verified to exit 1 with
  `File … has a score of …, which is beyond the score cap of 95, exiting.`). 95 sits just
  above today's worst file (`controller.ts` 94.4), so it blocks *regression* now. **Ratchet
  the cap down** as `controller.ts` is decomposed — the mirror of the coverage plan's
  threshold ratchet-up.

### 2.3 Baseline snapshot (committed, feeds coverage Phase 8)

```bash
mkdir -p docs/quality fta src --json > docs/quality/baseline-server.json fta web/src --json > docs/quality/baseline-client.json
```

JSON shape (field names verified): `file_name`, `cyclo`, `line_count`, `fta_score`, `assessment`, and `halstead` (`volume`, `difficulty`, `effort`, `time`, `bugs`, plus operator/operand counts). Commit these as the trend reference; the code-coverage plan's optional Phase 8 cross-references `fta_score` against coverage to rank refactor risk.

---

## Phase 3 — npm scripts

```jsonc
{
  "scripts": {
    "quality": "fta src && fta web/src",              // ranked, assessment-labeled tables (sorted by score)
    "quality:gate": "fta src && fta web/src",          // same, but exits 1 if any file exceeds score_cap (fta.json)
    "quality:snapshot": "fta src --json > docs/quality/baseline-server.json && fta web/src --json > docs/quality/baseline-client.json"
    // ESLint complexity runs as part of the existing `npm run lint`
  }
}
```

- `npm run quality` — prints the score-sorted hotspot tables (this **is** the ranked list;
  no custom script needed).
- `npm run quality:gate` — same command, but with `score_cap` set in `fta.json` it exits
  non-zero on a regression. Wire this into CI.
- `npm run quality:snapshot` — refresh the committed baselines after intentional work.

---

## Phase 4 — Refactoring targets (measured, ranked)

Act on these in order; re-run `npm run quality` after each to watch the score drop.

1. **`src/controller.ts`** — score 94.4, cyclo **216**, 815 lines. *The* hotspot. It mixes
   tab management, command dispatch, shell execution, ACP sessions, browser automation,
   scheduling, and file opening. Extract these into collaborators (one module per
   responsibility); the `max-lines` (200) warning already flags it. Highest leverage by far.
2. **`src/tab.ts`** — score 60.3, cyclo 58, 200 lines. The buffer-flatten / entry-formatting
   logic handles many entry types in one place; extract per-type formatters.
3. **`src/schedule.ts`** — score 59.6, cyclo **61**. High branching for its size; pull
   schedule-parsing/matching into smaller pure helpers.
4. **`web/src/App.tsx`** — score 58.6, cyclo 60, 178 lines. The only web file above "OK";
   split view/state concerns into child components or hooks (`react-hooks` rules already apply).
5. **`src/db.ts` / `src/index.ts` / `src/completion.ts`** (54–56) — "Could be better"; lower
   priority, address opportunistically when touched.

Everything else (52 "OK" server files, 12 "OK" web files) is fine — leave it alone.

---

## Directory layout

```
fta.json                         # FTA config: exclude tests/dirs, score_cap gate eslint.config.mjs                # + sonarjs complexity rules (Phase 1) docs/quality/ ├── baseline-server.json         # committed FTA snapshot for src/  (trend + coverage Phase 8) └── baseline-client.json         # committed FTA snapshot for web/src/
```

No custom scripts: FTA's table output is the ranked report; `score_cap` is the gate.

---

## Summary

| Layer | Tool | What it measures | Actioned via |
|---|---|---|---|
| Complexity (primary) | ESLint + `sonarjs` | cognitive complexity per function, dup strings | in-editor + `npm run lint`, line-precise |
| Correctness/style (existing) | ESLint (ts-eslint, unicorn, `max-lines`) | type safety, unused code, 200-line guideline | already wired |
| Trend + gate (optional) | FTA (`fta.json`) | FTA score, cyclomatic, Halstead; `score_cap` regression gate | `npm run quality` / `quality:gate` |
| Trend baseline | committed `docs/quality/*.json` | per-file score over time; feeds coverage Phase 8 | `npm run quality:snapshot` |
```