# Dead Code Detection Plan

## Problem

Dead code is the most common AI slop artifact. AI generates exports, utility functions, types, and even entire files that are never used. Over time these accumulate, increasing maintenance surface area and obscuring the actual code paths.

Current defenses are weak — ESLint's `no-unused-vars` only catches locally unused variables within a single file. It cannot detect:

| Category | Example | What misses it |
|---|---|---|
| Unused exports | Exported function never imported elsewhere | ESLint sees `export` and assumes usage |
| Unused files | Entire `.ts` file never imported by anything | No cross-file analysis |
| Unused types | Exported type/interface never referenced | TypeScript doesn't warn |
| Unused dependencies | `package.json` dependency nothing imports | No static analysis |
| Duplicate exports | Same symbol exported from multiple paths | Each path looks legitimate |

## Tool Selection: Knip

**Knip** is the best tool for this — dedicated to dead code detection, understands TypeScript project references, handles monorepos, and produces machine-readable JSON output.

| Factor | Knip | ts-prune | ts-unused-exports | depcheck |
|---|---|---|---|---|
| Unused exports | ✅ | ✅ | ✅ | ❌ |
| Unused files | ✅ | ❌ | ❌ | ❌ |
| Unused dependencies | ✅ | ❌ | ❌ | ✅ |
| Unused types | ✅ | ❌ | ❌ | ❌ |
| Duplicate exports | ✅ | ❌ | ❌ | ❌ |
| Entry-point aware | ✅ (configurable) | ❌ | ❌ | ❌ |
| Test files aware | ✅ | ❌ | ❌ | ❌ |
| npm / local | ✅ | ✅ | ✅ | ✅ |
| License | MIT | MIT | MIT | MIT |

Knip is the only tool that covers all five categories. ts-prune and ts-unused-exports cover only exports. depcheck covers only dependencies.

---

## Phase 1 — Install & Baseline

### 1.1 Install

```bash
npm install --save-dev knip
```

### 1.2 Initial baseline

```bash
npx knip --reporter json > docs/dead-code/baseline.json
```

### 1.3 Examine output

Knip produces a JSON report structured by category:

```json
{
  "files": [],
  "issues": [
    {
      "file": "src/legacy-helper.ts",
      "owners": [],
      "symbols": [
        { "name": "unusedFunction", "line": 5, "col": 1, "type": "function" }
      ]
    }
  ],
  "dependencies": [],
  "duplicates": [],
  "unused": []
}
```

It also prints a terminal summary:

```
/Users/ashmorgan/dev/janissary/src/legacy-helper.ts
  Unused function: unusedFunction

/Users/ashmorgan/dev/janissary/web/src/unused-component.tsx
  Unused file

janissary — 3 unused exports, 1 unused file, 1 unused dep
```

---

## Phase 2 — Configuration

### 2.1 Identify entry points

Knip needs to know where your app starts. This project has two independent codebases with distinct entry points:

**Server (`src/`)**:
- `src/main.ts` — boot function (called by launcher)
- `src/index.ts` — exports `startServer` (consumed by `main.ts`)
- `src/commands/index.ts` — registers all command handlers (consumed by `controller.ts`)

**Client (`web/src/`)**:
- `web/src/main.tsx` — React DOM mount
- `web/src/App.tsx` — main app component

### 2.2 Create `knip.json`

```json
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "entry": [
    "src/main.ts",
    "src/index.ts",
    "src/commands/index.ts",
    "web/src/main.tsx",
    "web/src/App.tsx"
  ],
  "project": [
    "src/**/*.{ts,tsx}",
    "web/src/**/*.{ts,tsx}"
  ],
  "ignore": [
    "src/**/*.test.{ts,tsx}",
    "src/**/*.spec.{ts,tsx}",
    "web/src/**/*.test.{ts,tsx}"
  ],
  "ignoreDependencies": [
    "ink",
    "ink-testing-library",
    "@xterm/xterm",
    "@xterm/addon-fit",
    "react",
    "react-dom",
    "dompurify",
    "marked",
    "eslint-plugin-import-x",
    "eslint-import-resolver-typescript"
  ],
  "ignoreBinaries": [
    "tsx",
    "vite",
    "eslint",
    "prettier"
  ],
  "compilers": {
    "tsx": "tsx"
  }
}
```

#### Configuration notes

| Field | Purpose |
|---|---|
| `entry` | Root files that are explicitly loaded. Knip traces imports from these to determine what's used. Server has three (main, index, commands index) because they're independently referenced. Client has two (main mounts React, App is the top component). |
| `project` | Glob of all source files Knip should consider. Excludes test files. |
| `ignore` | Test files excluded from analysis — they can export test utilities that look unused to Knip. |
| `ignoreDependencies` | Packages referenced in `package.json` but not directly imported (used via CLI, typings, or side effects). Ink is included because it's a runtime peer of the old terminal UI. eslint-plugin-import-x and eslint-import-resolver-typescript are ESLint plugins resolved by ESLint itself, not imported by source code. |
| `ignoreBinaries` | Tools used via npm scripts, not imported in source. |
| `compilers` | `tsx` compiler handles TypeScript + ESM resolution matching the project's runtime. |

### 2.3 Additional config for dynamic patterns

Some files in this project are loaded dynamically rather than statically imported:

| Pattern | Method | Knip handling |
|---|---|---|
| `openerForExtension(ext)` returns opener modules | Dynamic `import()` or registry lookup | Add dynamic entry hints |
| Recognizer modules in `src/recognizers/` | Imported by `recognizers/index.ts` | Already traced through static import |
| Command modules in `src/commands/` | Imported by `commands/index.ts` | Already traced through static import |

If Knip flags false positives for dynamically-referenced files, add them to `entry`:

```json
{
  "entry": [
    "src/main.ts",
    "src/index.ts",
    "src/commands/index.ts",
    "web/src/main.tsx",
    "web/src/App.tsx",
    "src/openers/index.ts",
    "src/openers/types.ts"
  ]
}
```

---

## Phase 3 — Running Separately

### 3.1 Server only

```bash
npx knip --tsconfig tsconfig.json --reporter json > docs/dead-code/server.json
```

### 3.2 Client only

Since Knip uses a single `tsconfig` reference, separate client analysis requires a custom config:

**`knip.client.json`**:

```json
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "entry": ["web/src/main.tsx", "web/src/App.tsx"],
  "project": ["web/src/**/*.{ts,tsx}"],
  "ignore": ["web/src/**/*.test.{ts,tsx}"],
  "ignoreDependencies": ["ink"],
  "compilers": { "tsx": "tsx" }
}
```

```bash
npx knip --config knip.client.json --reporter json > docs/dead-code/client.json
```

---

## Phase 4 — npm Scripts

```json
{
  "scripts": {
    "knip": "knip",
    "knip:server": "knip --reporter json > docs/dead-code/server.json",
    "knip:client": "knip --config knip.client.json --reporter json > docs/dead-code/client.json",
    "knip:summary": "knip --reporter compact",
    "knip:baseline": "knip --reporter json > docs/dead-code/baseline.json"
  }
}
```

Usage:

| Command | What it does |
|---|---|
| `npm run knip` | Full scan, terminal output with all findings |
| `npm run knip:server` | Server scan only, JSON report |
| `npm run knip:client` | Client scan only, JSON report |
| `npm run knip:summary` | Compact one-line-per-finding output |
| `npm run knip:baseline` | Save baseline JSON for comparison |

---

## Phase 5 — Refactoring Guidance Script

`scripts/dead-code-report.ts` processes the Knip JSON output into a ranked removal priority:

```
Priority 1 — Unused file (removal is safe, zero risk)
  File: src/legacy-parser.ts
  Reason: No file imports it. Likely leftover from a refactor.

Priority 2 — Unused export (internal, removal is safe)
  File: src/utils.ts
  Export: formatBytes (line 42)
  Usage: 0 imports across the codebase

Priority 3 — Unused export (exported, may be public API)
  File: src/index.ts
  Export: ServerOptions (line 18)
  Usage: 0 imports — check if this is meant to be a public type

Priority 4 — Unused dependency
  Package: lodash
  Reason: Listed in package.json but nothing imports it

Priority 5 — Duplicate export
  File: src/types.ts → BufferLine
  Re-exported by: src/protocol.ts
  Action: Consolidate to one definition
```

Run with:

```bash
npx tsx scripts/dead-code-report.ts
```

---

## Phase 6 — Triage & Suppression

Not every Knip finding is actionable. Known patterns to suppress:

### Exports used only in tests

If `src/foo.ts` exports a function only consumed by `src/foo.test.ts`, Knip flags it as unused. Use JSDoc `@knipignore` or `// knipignore`:

```ts
// knipignore — used only in tests
export function testHelper() { ... }
```

### Dynamically referenced files

Some files are loaded dynamically (e.g., `import()` expressions, plugin lookups). Add them to `entry` instead of suppressing, so Knip treats them as entry points.

### The `knipIgnore` field in config

```json
{
  "knipIgnore": ["src/dynamic-registry.ts"]
}
```

---

## Phase 7 — Outputs & Reports

| File | Purpose |
|---|---|
| `docs/dead-code/server.json` | Server scan results (gitignored) |
| `docs/dead-code/client.json` | Client scan results (gitignored) |
| `docs/dead-code/baseline.json` | Committed baseline snapshot |

---

## Directory Layout

```
knip.json
knip.client.json
docs/
└── dead-code/
    ├── baseline.json       # committed baseline snapshot
    ├── server.json         # latest server scan (gitignored)
    └── client.json         # latest client scan (gitignored)
scripts/
    └── dead-code-report.ts # ranked removal priority from Knip output
```

---

## Summary

| Category | What Knip reports | Action |
|---|---|---|
| Unused exports | Exported symbol with zero import references | Remove or add `// knipignore` |
| Unused files | File never imported by any entry point | Delete if safe |
| Unused dependencies | `package.json` entry no code imports | Remove from `package.json` |
| Unused types | Exported type/interface never referenced | Remove or consolidate |
| Duplicate exports | Same symbol exported from multiple paths | Consolidate to one path |

Run: `npm run knip` to scan both codebases in one command.
