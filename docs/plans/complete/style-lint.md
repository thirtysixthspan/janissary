# CSS Lint Plan

## Current State (verified)

- **One CSS file:** `web/src/theme.css` — 174 lines, 7.9 KB. Imported in `web/src/main.tsx`
  alongside `@xterm/xterm/css/xterm.css` (third-party; exclude from linting).
- **Already Prettier-formatted** (`npm run format` covers `.css`). Formatting is a solved
  problem; a CSS linter here is for *correctness/conventions*, not whitespace.
- **No CSS linting today.** The file is clean: long hex throughout, kebab-case classes,
  component-ordered rules. A correctness linter will find little — e.g. the legacy color
  notation on line 137 (`rgba(0, 0, 0, 0.4)`), which config-standard's
  `color-function-notation: modern` would rewrite to `rgb(0 0 0 / 40%)`; possibly a few
  `no-descending-specificity` hits from the component-ordered rules. Run the tool to get
  the exact list.

---

## Plan — stylelint + config-standard

**stylelint** is purpose-built for CSS, has no overlap with Prettier (v15+ removed all
stylistic rules), and requires no integration work in the existing ESLint config. The
browser-compat plugin is omitted — Janissary's web UI runs in the user's own modern browser
(the server even drives Chromium via Playwright), so there is no old-browser audience to
support.

### 1. Install

```bash
npm install --save-dev stylelint stylelint-config-standard
```

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
  specificity. Re-enable later if you want to enforce it.
- `selector-class-pattern: null` — allows the existing `.tab.active` / `.tab-close` naming.
- Nothing else needs overriding; Prettier owns formatting so there is no rule conflict.

### 3. Scripts — `package.json`

```jsonc
{
  "scripts": {
    "lint:css": "stylelint \"web/src/**/*.css\"",
    "lint:css:fix": "stylelint \"web/src/**/*.css\" --fix"
  }
}
```

First run: `npm run lint:css` to see the real finding list, then `--fix` what auto-fixes
and hand-fix the rest.
