# Cross-Browser & Performance Assessment Plan

## Current State

### Performance concerns

| Concern | Impact | Details |
|---|---|---|
| xterm.js bundled eagerly | ~800 KB – 1 MB in main bundle | `@xterm/xterm` imported at top of `TerminalCard.tsx`, loaded on every page regardless of whether a terminal is shown |
| No code splitting | Entire app loaded upfront | No `React.lazy()`, no dynamic `import()`, no `manualChunks` in Vite config |
| `marked` + `DOMPurify` ~95 KB | Loaded on every page | Both imported eagerly in `Transcript.tsx` |
| Estimated bundle | ~500-700 KB min+gzip | >80% from xterm.js alone |
| No bundle visualization | Unknown true composition | No tool configured to analyze the build output |

### Cross-browser concerns

| API | Location | Risk |
|---|---|---|
| `navigator.clipboard.writeText()` | `App.tsx:159` | No `.catch()` — unhandled rejection on HTTPS mismatch or permission denial |
| `ResizeObserver` | `Transcript.tsx:53`, `TerminalCard.tsx:51` | Unsupported in IE11 (acceptable for this app) |
| `URLSearchParams` | `ws.ts:18`, `ImageTab.tsx:10` | Unsupported in IE11 (acceptable for this app) |
| `dangerouslySetInnerHTML` | `Transcript.tsx:20` | Cross-browser (raw HTML), mitigated by DOMPurify |
| CSS custom properties | `theme.css` | No IE11 support (acceptable) |

### Existing coverage

| Area | Tool | Status |
|---|---|---|
| Bundle analysis | None | ❌ |
| Performance audit | None | ❌ |
| Cross-browser testing | Playwright (in deps) | Installed but not configured for cross-browser |
| CSS quality | None | ❌ |
| Bundle size budgeting | None | ❌ |

---

## Tool Selection

| Tool | Category | What it provides | Install |
|---|---|---|---|
| **Lighthouse** | Performance audit | Scored report (Performance, Accessibility, Best Practices, SEO) with actionable recommendations | `npm i -D lighthouse` |
| **vite-bundle-visualizer** | Bundle analysis | Interactive treemap of the Vite production bundle, per-module sizes | `npm i -D vite-bundle-visualizer` |
| **Playwright** (existing) | Cross-browser testing | Run tests in Chromium + Firefox + WebKit, catch browser-specific failures | Already in `dependencies` |
| **stylelint** | CSS quality + browser compat | Lint CSS for errors, inconsistent patterns, and unsupported features | `npm i -D stylelint stylelint-config-standard stylelint-no-unsupported-browser-features` |
| **size-limit** | Bundle size budgeting | Set size budgets for JS bundles, exit non-zero if exceeded | `npm i -D size-limit` |

---

## 1. Lighthouse — Performance Audit

### Why
The gold standard for web performance measurement. Runs headless Chrome locally, produces a scored report (0-100) across five categories, each with specific recommendations.

### Setup

```bash
npm install --save-dev lighthouse
```

### Run

```bash
# Requires a running server. Start the app first, then:
npx lighthouse http://localhost:PORT --output html --output-path docs/perf/report.html --chrome-flags="--headless"
```

Or via Node script (`scripts/perf-audit.ts`):

```ts
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
const result = await lighthouse('http://localhost:PORT', {
  port: chrome.port,
  output: 'html',
  onlyCategories: ['performance', 'accessibility', 'best-practices'],
});
await chrome.kill();
```

### Output

Lighthouse produces a scored HTML report:

```
Performance:  72  (Could be faster)
  ▸ Eliminate render-blocking resources
  ▸ Reduce unused JavaScript (xterm.js)
  ▸ Properly size images (none found — good)

Accessibility:  95  (Great)
  ▸ Background and foreground colors do not have sufficient contrast

Best Practices:  100  (Perfect)

SEO:  90
  ▸ Document does not have a meta description
```

### npm script

```json
{
  "scripts": {
    "perf": "npm run perf:audit && npm run perf:bundle",
    "perf:audit": "npx tsx scripts/perf-audit.ts"
  }
}
```

---

## 2. vite-bundle-visualizer — Bundle Analysis

### Why
The Vite production bundle is opaque without a visualizer. This tool generates an interactive treemap showing exactly which modules consume space, revealing code-splitting opportunities.

### Setup

```bash
npm install --save-dev vite-bundle-visualizer
```

### Run

```bash
npx vite-bundle-visualizer --config web/vite.config.ts
```

Opens an interactive treemap in the browser:

```
📦 Total: 1.2 MB (minified, before gzip)

  ▸ @xterm/xterm     856 KB  (71%)
  ▸ react-dom        142 KB  (12%)
  ▸ react             52 KB  (4%)
  ▸ dompurify         65 KB  (5%)
  ▸ marked            30 KB  (3%)
  ▸ @xterm/addon-fit   5 KB  (<1%)
  ▸ web/src/           8 KB  (<1%)  ← application code
```

### npm script

```json
{
  "scripts": {
    "perf:bundle": "vite-bundle-visualizer --config web/vite.config.ts"
  }
}
```

### What to look for

| Signal | Action |
|---|---|
| xterm.js > 50% of bundle | Lazy-load `TerminalCard` with `React.lazy()` |
| Large library used in one component | Dynamic `import()` for that component |
| Duplicate modules across chunks | Check for version mismatches |
| First-party code << dependency code | Normal for a terminal app, but confirms code-splitting is the right fix |

---

## 3. Playwright — Cross-Browser Tests

### Why
Playwright is already installed as a dependency (used by the server for browser automation). It supports Chromium, Firefox, and WebKit with the same API. Adding a cross-browser test script catches rendering differences before they reach users.

### Setup

No install needed. Create `web/test/cross-browser.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('App loads in all browsers', () => {
  test('renders the app shell without crashing', async ({ page }) => {
    await page.goto('http://localhost:PORT/?token=test');
    await expect(page.locator('#root')).not.toBeEmpty();
  });

  test('transcript renders markdown from server state', async ({ page }) => {
    await page.goto('http://localhost:PORT/?token=test');
    // Server pushes a 'state' event on connect — wait for the transcript to render
    await expect(page.locator('.transcript')).toBeVisible({ timeout: 5000 });
  });

  test('tab strip is interactive', async ({ page }) => {
    await page.goto('http://localhost:PORT/?token=test');
    const tabs = page.locator('.tab-strip > *');
    await expect(tabs.first()).toBeVisible();
  });
});
```

### Run across browsers

```bash
# Install browser binaries (if not already)
npx playwright install chromium firefox webkit

# Run tests in all three
npx playwright test --browser=chromium --browser=firefox --browser=webkit
```

### What cross-browser issues to expect

| Feature | Chromium | Firefox | WebKit |
|---|---|---|---|
| `navigator.clipboard` | ✅ | ✅ | ⚠️ Requires user gesture |
| `ResizeObserver` | ✅ | ✅ | ✅ (Safari 13.1+) |
| CSS custom properties | ✅ | ✅ | ✅ |
| `dangerouslySetInnerHTML` + DOMPurify | ✅ | ✅ | ✅ |
| xterm.js canvas rendering | ✅ | ✅ | ⚠️ Potential font/rendering diff |

### npm script

```json
{
  "scripts": {
    "test:cross-browser": "playwright test --browser=chromium --browser=firefox --browser=webkit"
  }
}
```

---

## 4. stylelint — CSS Quality & Browser Compatibility

### Why
The app has a custom `theme.css` that uses modern CSS (custom properties, flexbox, `@keyframes`). stylelint catches errors, enforces consistent patterns, and `stylelint-no-unsupported-browser-features` flags CSS features not supported in target browsers.

### Setup

```bash
npm install --save-dev stylelint stylelint-config-standard stylelint-no-unsupported-browser-features
```

### Config — `web/.stylelintrc.json`

```json
{
  "extends": "stylelint-config-standard",
  "plugins": ["stylelint-no-unsupported-browser-features"],
  "rules": {
    "plugin/no-unsupported-browser-features": [true, {
      "browsers": ["last 2 Chrome versions", "last 2 Firefox versions", "last 2 Safari versions"],
      "ignore": ["css-custom-properties", "flexbox"]
    }],
    "no-descending-specificity": null,
    "color-hex-length": "long"
  }
}
```

### Run

```bash
npx stylelint "web/src/**/*.css"
```

### What it catches

| Finding | Example | Fix |
|---|---|---|
| Unsupported CSS feature | `gap` in old Flexbox | Already well-supported, but would flag if browser target is old |
| Invalid syntax | Missing semicolons, duplicated selectors | Autofix with `--fix` |
| Inconsistent patterns | Mix of hex/rgb/hsl colors | Enforce one style |
| Duplicate properties | Same property declared twice | Remove redundant line |

### npm script

```json
{
  "scripts": {
    "lint:css": "stylelint \"web/src/**/*.css\""
  }
}
```

---

## 5. size-limit — Bundle Size Budgeting

### Why
Prevents bundle size regressions. Set a size cap for the JS bundle; `size-limit` exits non-zero if exceeded. This makes performance a hard constraint rather than an afterthought.

### Setup

```bash
npm install --save-dev size-limit @size-limit/file
```

### Config — add to `package.json`

```json
{
  "size-limit": [
    {
      "name": "main JS bundle",
      "path": "web/dist/assets/*.js",
      "limit": "700 KB"
    },
    {
      "name": "main CSS bundle",
      "path": "web/dist/assets/*.css",
      "limit": "10 KB"
    }
  ]
}
```

### Run

Requires a production build first:

```bash
npm run build:web && npx size-limit
```

Output:

```
  main JS bundle:  652 KB ⚠️   (limit 700 KB)
  main CSS bundle:    3 KB ✅   (limit 10 KB)
```

### Sizing the limit

Based on the bundle analysis:
- Current estimate: ~500-700 KB (dominated by xterm.js)
- Set initial limit to ~700 KB (allows headroom)
- After adding lazy-loading for xterm: reduce limit to ~200 KB

### npm script

```json
{
  "scripts": {
    "perf:size": "npm run build:web -- --mode production && size-limit"
  }
}
```

---

## npm Scripts

```json
{
  "scripts": {
    "perf": "npm run perf:audit && npm run perf:bundle && npm run perf:size",
    "perf:audit": "npx tsx scripts/perf-audit.ts",
    "perf:bundle": "vite-bundle-visualizer --config web/vite.config.ts",
    "perf:size": "npm run build:web -- --mode production && size-limit",
    "lint:css": "stylelint \"web/src/**/*.css\"",
    "test:cross-browser": "playwright test"
  }
}
```

---

## Directory Layout

```
web/
├── test/
│   └── cross-browser.spec.ts
└── .stylelintrc.json
docs/
└── perf/
    └── report.html          # Lighthouse audit (gitignored)
scripts/
    └── perf-audit.ts        # Lighthouse runner
```

---

## Summary

| Layer | Tool | What it measures | Run command |
|---|---|---|---|
| Performance audit | Lighthouse | Performance, accessibility, best practices, SEO scores | `npm run perf:audit` |
| Bundle composition | vite-bundle-visualizer | Module-level size breakdown, code-split opportunities | `npm run perf:bundle` |
| Cross-browser rendering | Playwright | Failures in Chromium vs Firefox vs WebKit | `npm run test:cross-browser` |
| CSS quality + compat | stylelint | Syntax errors, unsupported features, inconsistent patterns | `npm run lint:css` |
| Bundle budget | size-limit | JS and CSS bundle size against configured caps | `npm run perf:size` |
