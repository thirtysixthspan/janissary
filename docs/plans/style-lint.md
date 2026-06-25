# CSS Lint Plan

## What changed from the prior draft (and why)

The prior draft picked a defensible tool (stylelint) but its "issues stylelint will catch"
table is almost entirely fabricated, its headline feature (browser-compat linting) is
low-value for this app, and it ignores that **Prettier already formats the CSS**. Everything
below was checked against the actual `web/src/theme.css`.

| Prior draft | Problem | Fix in this plan |
|---|---|---|
| "Short hex `#ff0` … (`.btn` is a non-existent class)", `color-hex-length` | **Fabricated.** There is no `#ff0` and no `.btn` in the file — every color is already long hex (`#17181b`, `#ffd93d`) or `rgba()`. Zero hits. | Removed. |
| "Duplicate selectors `.tab .tab-close` (37–40)", `no-duplicate-selectors` | **Wrong.** Line 37 is `.tab .tab-close`; line 41 is `.tab .tab-close:hover` — a different selector. Not a duplicate; won't fire. | Removed. |
| "Universal selector (13)", `selector-max-universal` | `stylelint-config-standard` **does not enable** `selector-max-universal`. And `* { box-sizing: border-box }` is a standard reset — flagging it is noise. | Removed. |
| "Inconsistent font-size units", `unit-allowed-list` | Marked "(opt-in)" in the draft itself — not enabled by config-standard, so not caught. | Removed. |
| Browser-compat rows (custom props, `gap`, `inset`) | The proposed config **ignores** `css-custom-properties`/`css-gap`/`css-resize`/`css-sticky` (exactly the features the file uses), and the rest are supported by the stated targets — so it produces **no** warnings. | Browser-compat plugin dropped (see below). |
| `css-report.ts` "CSS Score /100" (`100 - issues*3`) | An arbitrary score that duplicates the linter's own output — the same over-built scoring-script pattern as the sibling plans. | Dropped; use the linter's output + `--fix`. |
| "174 lines, 2.8 KB" | Size wrong — it's **7.9 KB**. | Corrected. |
| "No CSS linting; enforces consistency" implies formatting is unmanaged | **Prettier already formats `.css`** via `npm run format` (`prettier --write .`). Formatting consistency is already handled. | Scope the linter to *correctness*, which is all modern stylelint does anyway. |

### Was there a better alternative? — Two real ones

**1. Scope/value: drop browser-compat entirely.** The plan's differentiator —
`stylelint-no-unsupported-browser-features` — is the wrong fit here. Janissary's web UI is a
**localhost tool the user opens in their own (modern) browser** (the server even drives
Chromium via Playwright). There is no public audience on old browsers to support, and the
proposed config ignores the very features the file relies on. So the browser-compat plugin
and `.browserslistrc` add config surface for ~zero signal. Drop them.

**2. Tool: `@eslint/css` (v1.3.0) integrates into the existing ESLint workflow.** This repo
already runs a substantial ESLint flat config and now has `npm run lint:files` (lint only
changed files). `@eslint/css` adds CSS linting to that *same* `eslint` invocation — no second
toolchain, no separate config file, and changed `.css` files get caught by the existing
workflow. Its trade-off is real integration work (below), so both paths are presented.

**Recommendation:** for a single 174-line file that Prettier already formats, keep it
minimal. **Default to stylelint + `stylelint-config-standard` only** (Path A) — purpose-built,
zero integration risk, composes cleanly with Prettier (stylelint v15+ removed all stylistic
rules, so there's no overlap). Choose `@eslint/css` (Path B) only if unifying CSS into
`npm run lint` / `lint:files` is worth the flat-config wiring.

---

## Current State (verified)

- **One CSS file:** `web/src/theme.css` — 174 lines, 7.9 KB. Imported in `web/src/main.tsx`
  alongside `@xterm/xterm/css/xterm.css` (third-party; exclude from linting).
- **Already Prettier-formatted** (`npm run format` covers `.css`). Formatting is a solved
  problem; a CSS linter here is for *correctness/conventions*, not whitespace.
- **No CSS linting and no `browserslist` config** today (both confirmed absent).
- The file is clean: long hex throughout, kebab-case classes, component-ordered rules. A
  correctness linter will find **little** — e.g. the one legacy color notation on line 137
  (`box-shadow: 0 -6px 24px rgba(0, 0, 0, 0.4)`), which config-standard's
  `color-function-notation: modern` / `alpha-value-notation` would rewrite to
  `rgb(0 0 0 / 40%)`; possibly a few `no-descending-specificity` hits from the
  component-ordered rules. Run the tool to get the exact list — but do not expect the
  fabricated items above.

---

## Path A (recommended) — stylelint + config-standard

### 1. Install

```bash
npm install --save-dev stylelint stylelint-config-standard
```

(No browser-compat plugin — see rationale above.)

### 2. Config — `web/.stylelintrc.json`

```json
{
  "extends": "stylelint-config-standard",
  "rules": {
    "no-descending-specificity": null,
    "selector-class-pattern": null
  }
}
```

- `no-descending-specificity: null` — the file is deliberately ordered by component, not
  specificity. (Re-enable later if you want to enforce it.)
- `selector-class-pattern: null` — allows the existing `.tab.active` / `.tab-close` naming.
- Nothing else needs overriding; let config-standard's correctness rules apply. Prettier owns
  formatting, so there is no rule conflict to manage.

### 3. Scripts — `package.json`

```jsonc
{
  "scripts": {
    "lint:css": "stylelint \"web/src/**/*.css\"",
    "lint:css:fix": "stylelint \"web/src/**/*.css\" --fix"
  }
}
```

First run: `npm run lint:css` to see the real (small) finding list, then `--fix` what
auto-fixes and hand-fix the rest.

---

## Path B (alternative) — `@eslint/css` in the existing ESLint config

Folds CSS into `npm run lint` and `npm run lint:files` — one toolchain.

### 1. Install

```bash
npm install --save-dev @eslint/css
```

### 2. Add a CSS block to `eslint.config.mjs`

```js
import css from '@eslint/css';

// inside ts.config(...):
{
  files: ['web/src/**/*.css'],
  plugins: { css },
  language: 'css/css',
  rules: {
    'css/no-duplicate-imports': 'error',
    'css/no-empty-blocks': 'error',
    'css/no-invalid-at-rules': 'error',
    'css/no-invalid-properties': 'error',
  },
},
```

### Integration tasks (the trade-off — verify these)

1. **Scope the existing broad config blocks to JS/TS** so their TypeScript/unicorn rules
   don't run against CSS-parsed files. The first blocks in `eslint.config.mjs` have no
   `files` key (they match everything); add `files: ['**/*.{ts,tsx,mjs,cjs,js}']` to the base
   rules block (or otherwise exclude `**/*.css`).
2. **Add `.css` to `scripts/lint-files.mjs`** — its `LINTABLE` extension filter currently
   omits `css`, so changed stylesheets wouldn't be picked up by `npm run lint:files`. Add
   `css` to the regex.
3. **Confirm `@eslint/css` loads under ESLint 10.5** (it uses the language API; verify it
   resolves and lints one file before relying on it).

---

## Dropped from the prior plan

| Item | Why |
|---|---|
| `stylelint-no-unsupported-browser-features` + `.browserslistrc` | Localhost UI in the user's own modern browser — no old-browser audience; config ignored the used features anyway. |
| `scripts/css-report.ts` + "CSS Score /100" | Arbitrary score (`100 − issues×3`) duplicating the linter's own output. |
| `lint:css:report` script | Removed with the script. |
| The fabricated "issues" table | None of those issues exist in the file. |

---

## Summary

One small, already-Prettier-formatted stylesheet needs a *correctness* linter, not a tracking
subsystem.

| | Path A (recommended) | Path B (`@eslint/css`) |
|---|---|---|
| Tool | stylelint + config-standard | existing ESLint + `@eslint/css` |
| New files | `web/.stylelintrc.json` | none (edits `eslint.config.mjs`) |
| Runs with `lint:files` | no (separate `lint:css`) | yes, after wiring |
| Integration risk | none | scope JS blocks + ESLint-10 check |
| Formatting | Prettier (unchanged) | Prettier (unchanged) |
| Browser-compat | dropped | dropped |
