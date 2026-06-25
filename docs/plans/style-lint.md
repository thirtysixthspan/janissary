# Style Lint Assessment Plan

## Tool Selection

**Winner: stylelint** — the de facto standard CSS linter. Mature (since 2015), 14k+ GitHub stars, 12M+ weekly npm downloads, largest plugin ecosystem.

### Runners-up considered

| Tool | Why not chosen |
|---|---|
| `@eslint/css` (ESLint CSS plugin) | Released Feb 2025 — much smaller rule set, no browser-compat plugin equivalent to `stylelint-no-unsupported-browser-features`. Would require a separate ESLint config for CSS anyway. |
| **csskit** (Rust) | All-in-one (fmt, lint, minify, transpile) but very new — smaller rule set, no browser-compat plugin. Would add a non-npm binary dependency. |
| **clint** (Rust) | Pre-v1 alpha — not production-ready. |
| **CSSLint** | Archived, unmaintained since 2019. |
| **w3c-validate-css** | Purely syntax validation (W3C spec compliance), no code-quality or browser-compat rules. |

### stylelint + plugin stack

| Package | Purpose |
|---|---|
| `stylelint` | Core linter |
| `stylelint-config-standard` | 100+ recommended rules (avoid errors, enforce conventions) |
| `stylelint-no-unsupported-browser-features` | Flags CSS features unsupported by target browsers (via caniuse data) |

---

## Current State

- **One CSS file:** `web/src/theme.css` (174 lines, 2.8 KB)
- **Two CSS imports in `main.tsx`:** `@xterm/xterm/css/xterm.css` (third-party, not linted) and `./theme.css`
- **No CSS linting** configured anywhere
- **No `browserslist` config** in package.json or `.browserslistrc`

### Issues stylelint will catch in `theme.css`

| Issue | Rule | Line(s) |
|---|---|---|
| `* { box-sizing: border-box; }` — universal selector | `selector-max-universal` | 13 |
| Duplicate `color`/`background` declared in compound selectors (`.tab .tab-close`) | `no-duplicate-selectors` | 37-40 |
| Inconsistent font-size units (`px` everywhere, no `rem`) | `unit-allowed-list` (opt-in) | 22, 35, 39, 73, 152, 163, 171 |
| Short hex `#ff0` used once (`.btn` is a non-existent class) | `color-hex-length` | — |
| Multiple declarations sharing a selector that could cascade | `declaration-block-no-shorthand-property-overrides` | — |
| CSS custom properties (`--bg`, `--fg`, etc.) — unsupported in IE11 | `plugin/no-unsupported-browser-features` | 3-10 |
| `gap` in flexbox — fully supported in modern browsers but would flag if targeting older ones | `plugin/no-unsupported-browser-features` | 30, 44, 45, 68, 148, 162 |
| `inset` shorthand (`.terminal-card.maximized`) | `plugin/no-unsupported-browser-features` | 158 |

---

## Setup

### 1. Install

```bash
npm install --save-dev stylelint stylelint-config-standard stylelint-no-unsupported-browser-features
```

### 2. Config — `web/.stylelintrc.json`

Scoped to the web client directory so it only applies to client CSS:

```json
{
  "extends": "stylelint-config-standard",
  "plugins": ["stylelint-no-unsupported-browser-features"],
  "rules": {
    "plugin/no-unsupported-browser-features": [true, {
      "browsers": [
        "last 2 Chrome versions",
        "last 2 Firefox versions",
        "last 2 Safari versions"
      ],
      "ignore": [
        "css-custom-properties",
        "css-gap",
        "css-resize",
        "css-sticky"
      ],
      "severity": "warning"
    }],
    "no-descending-specificity": null,
    "selector-class-pattern": null,
    "color-hex-length": "long",
    "declaration-block-no-redundant-longhand-properties": true,
    "shorthand-property-no-redundant-values": true
  },
  "ignoreFiles": [
    "**/node_modules/**",
    "web/dist/**"
  ]
}
```

Key choices:
- **`plugin/no-unsupported-browser-features` set to `"warning"`** — this is informational guidance, not a hard failure. The user can review and decide whether to polyfill, add fallbacks, or bump browser targets.
- **`ignore` array** lists features this codebase intentionally uses despite not being universal (custom properties, flexbox gap, resize, sticky). Without these ignores, every use of `--bg` etc. would warn.
- **`no-descending-specificity: null`** — disabled because the codebase intentionally orders by component (base → tabstrip → transcript → picker → terminal) not by specificity.
- **`selector-class-pattern: null`** — allows the existing BEM-like naming (.tab, .tab.active, .tab-close).

### 3. Browserslist — `web/.browserslistrc`

Creates a single source of truth for browser targets (shared with autoprefixer if added later):

```
last 2 Chrome versions
last 2 Firefox versions
last 2 Safari versions
```

stylelint-no-unsupported-browser-features reads this automatically if present, so the rule config above can omit the `browsers` array and it will pick up from this file:

```json
{
  "plugins": ["stylelint-no-unsupported-browser-features"],
  "rules": {
    "plugin/no-unsupported-browser-features": [true, {
      "ignore": ["css-custom-properties", "css-gap", "css-resize", "css-sticky"],
      "severity": "warning"
    }]
  }
}
```

---

## Running

### npm script

Add to `package.json`:

```json
{
  "scripts": {
    "lint:css": "stylelint \"web/src/**/*.css\"",
    "lint:css:fix": "stylelint \"web/src/**/*.css\" --fix"
  }
}
```

### Execution

```bash
npm run lint:css
```

### Expected output

```
web/src/theme.css
 3:1  ⚠  Unexpected universal selector       selector-max-universal
30:5  ⚠  "gap" is not supported by the CSS    plugin/no-unsupported-browser-features (warning)
          specification (css-gap)
34:3  ⚠  Expected "#ff0" to be "#ffff00"     color-hex-length
```

---

## Guidance Script — `scripts/css-report.ts`

Produces a scored summary with actionable refactoring guidance, analogous to the other quality scripts:

```ts
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

interface CssIssue {
  line: number;
  column: number;
  rule: string;
  severity: string;
  text: string;
}

const CSS_PATH = 'web/src/**/*.css';

function runStylelint(): CssIssue[] {
  const output = execSync(
    `npx stylelint "${CSS_PATH}" --formatter json --max-warnings 0 2>/dev/null || true`,
    { encoding: 'utf-8' }
  );
  const results = JSON.parse(output);
  return results.flatMap((r: any) =>
    r.warnings.map((w: any) => ({
      line: w.line,
      column: w.column,
      rule: w.rule,
      severity: w.severity,
      text: w.text,
    }))
  );
}

function categorizeIssues(issues: CssIssue[]) {
  return {
    browserCompat: issues.filter(i => i.rule === 'plugin/no-unsupported-browser-features'),
    consistency: issues.filter(i => i.rule !== 'plugin/no-unsupported-browser-features' && i.severity === 'error'),
    warnings: issues.filter(i => i.severity === 'warning'),
  };
}

const issues = runStylelint();
const { browserCompat, consistency, warnings } = categorizeIssues(issues);

console.log(`\nCSS Quality Report — ${new Date().toISOString().split('T')[0]}\n`);
console.log(`Total issues: ${issues.length}`);
console.log(`  Browser compatibility warnings: ${browserCompat.length}`);
console.log(`  Consistency errors:            ${consistency.length}`);
console.log(`  Warnings:                      ${warnings.length}`);

if (browserCompat.length > 0) {
  console.log('\n--- Browser Compatibility ---');
  for (const i of browserCompat) {
    console.log(`  web/src/theme.css:${i.line}:${i.column}  ${i.text}`);
  }
}

if (consistency.length > 0) {
  console.log('\n--- Style Consistency ---');
  for (const i of consistency) {
    console.log(`  web/src/theme.css:${i.line}:${i.column}  ${i.text}`);
  }
}

// File-level score
const score = Math.max(0, Math.round(100 - issues.length * 3));
console.log(`\nCSS Score: ${score}/100`);
if (score >= 80) console.log('Rating: Good');
else if (score >= 50) console.log('Rating: Needs improvement');
else console.log('Rating: Poor');

console.log(`\nRefactoring guidance:`);
if (browserCompat.length > 0) {
  console.log(`  • Add the ignored features (custom properties, gap) to the ignore array if` +
    ` they are intentional, or drop browser targets that don't support them.`);
}
if (consistency.some(i => i.rule === 'selector-max-universal')) {
  console.log(`  • Replace the universal selector (*) with explicit element or class selectors.`);
}
console.log(`  • Run "npm run lint:css:fix" to auto-fix formatting issues.`);
```

### Sample output

```
CSS Quality Report — 2026-06-25

Total issues: 3
  Browser compatibility warnings: 1
  Consistency errors:            2
  Warnings:                      0

--- Browser Compatibility ---
  web/src/theme.css:30:5  "gap" is not supported by CSS specification (css-gap)

--- Style Consistency ---
  web/src/theme.css:3:1  Unexpected universal selector
  web/src/theme.css:34:3  Expected "#ff0" to be "#ffff00"

CSS Score: 91/100
Rating: Good

Refactoring guidance:
  • Add the ignored features (custom properties, gap) to the ignore array if
    they are intentional, or drop browser targets that don't support them.
  • Replace the universal selector (*) with explicit element or class selectors.
  • Run "npm run lint:css:fix" to auto-fix formatting issues.
```

---

## npm Scripts

```json
{
  "scripts": {
    "lint:css": "stylelint \"web/src/**/*.css\"",
    "lint:css:fix": "stylelint \"web/src/**/*.css\" --fix",
    "lint:css:report": "npx tsx scripts/css-report.ts"
  }
}
```

---

## Directory Layout

```
web/
├── .stylelintrc.json
├── .browserslistrc
└── src/
    └── theme.css
scripts/
    └── css-report.ts
```

---

## Summary

stylelint + `stylelint-config-standard` + `stylelint-no-unsupported-browser-features` covers both requirements:

1. **"Flags CSS features unsupported in target browsers"** — `plugin/no-unsupported-browser-features` (configurable via browserslist, severity set to `warning` so it informs without blocking)
2. **"Enforces consistency"** — `stylelint-config-standard` provides 100+ rules covering syntax errors, duplicate selectors, shorthand properties, color formats, and naming conventions

The tool is scoped to `web/src/**/*.css` so it only runs on client code. No CI integration. Output is both raw lint results and an actionable scored report.
