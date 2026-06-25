# Code Duplication Assessment Plan

## Current State

### Duplication patterns identified

| Pattern | Severity | Files |
|---|---|---|
| Command handler boilerplate (same `import` + `export const command: Command` skeleton) | HIGH | All 17 `src/commands/*.ts` (except `types.ts` / `index.ts`) |
| Test file boilerplate (near-identical test blocks for simple commands) | HIGH | `clear.test.ts`, `next.test.ts`, `close.test.ts` and likely more |
| Recognizer export skeleton (same `Set` + `export const xyzRecognizer` pattern) | MEDIUM | `bash.ts`, `db.ts`, `acp.ts` in `src/recognizers/` |
| `match` function copy-paste (exact-string variant) | MEDIUM | `clear.ts`, `next.ts`, `hist.ts`, `close.ts`, `state.ts` |
| `match` function copy-paste (regex-prefix variant) | MEDIUM | `db.ts`, `msg.ts`, `broadcast.ts`, `browser.ts`, `connection.ts`, `agent.ts`, `schedule.ts`, `profile.ts`, `acp.ts`, `open.ts` |
| Duplicate test context literal (`const noDb = { openDbs: [] }`) | MEDIUM | `bash.test.ts`, `acp.test.ts`, `db.test.ts` |
| Subprocess handling overlap (`INTERACTIVE_PROGRAMS` set vs shell dispatch) | LOW | `shell.ts`, `interactive.ts` |

No duplication detection tool is currently configured.

---

## Tool Selection: jscpd

jscpd is the most mature, widely-used copy/paste detector for source code. Available in two versions:

| Factor | jscpd v5 (Rust) | jscpd v4 (TypeScript) |
|---|---|---|
| Speed | 24-37x faster | Baseline |
| Runtime | Self-contained binary (no Node.js) | Node.js |
| Formats | 223 | 224 |
| API | CLI only + Rust crate | CLI + Node.js API |
| Status | Active | Maintenance |
| Install as devDep | `npm i -D jscpd@5` | `npm i -D jscpd@4` |

**v5 (Rust) is recommended** — faster, no runtime overhead, and this project only needs CLI usage.

### How jscpd works

Uses the **Rabin-Karp rolling hash algorithm** to efficiently find duplicate token sequences across files. Supports three detection modes:

| Mode | What it detects | Use case |
|---|---|---|
| `strict` | Exact token-for-token matches | Finding verbatim copy-paste |
| `mild` (default) | Structural clones (same shape, different names) | Finding repeated patterns with different identifiers |
| `weak` | Structural clones ignoring comments | Finding logic duplication where only comments differ |

---

## Phase 1 — Install

```bash
npm install --save-dev jscpd@5
```

This installs both `jscpd` and `cpd` commands (same binary, different name). Verify:

```bash
npx jscpd --version
```

---

## Phase 2 — Initial Baseline Scans

### 2.1 Full server scan

```bash
npx jscpd src/ \
  --format typescript,tsx \
  --min-lines 5 \
  --mode mild \
  --reporters json,console-full \
  --output docs/duplication/server-baseline.json
```

### 2.2 Full client scan

```bash
npx jscpd web/src/ \
  --format typescript,tsx \
  --min-lines 5 \
  --mode mild \
  --reporters json,console-full \
  --output docs/duplication/client-baseline.json
```

### 2.3 Examine output

```json
{
  "statistics": {
    "total": {
      "sources": 45,
      "lines": 5200,
      "tokens": 21000
    },
    "clones": [
      {
        "id": "abc123",
        "lines": 12,
        "tokens": 48,
        "fragment": "export const command: Command = {\n  name: 'clear',\n  match: (cmd) => cmd.toLowerCase() === 'clear',\n  ...",
        "firstFile": {
          "name": "src/commands/clear.ts",
          "start": 3,
          "end": 9,
          "startLoc": { "line": 3, "column": 1 },
          "endLoc": { "line": 9, "column": 2 }
        },
        "secondFile": {
          "name": "src/commands/next.ts",
          "start": 3,
          "end": 9,
          "startLoc": { "line": 3, "column": 1 },
          "endLoc": { "line": 9, "column": 2 }
        }
      }
    ],
    "duplication": {
      "total": {
        "lines": 85,
        "percentage": 1.6
      }
    }
  }
}
```

Terminal output includes a clone-by-clone breakdown:

```
Found 14 clones (3.2% duplication):

src/commands/clear.ts:3-9  ↔  src/commands/next.ts:3-9   (7 lines)
src/commands/clear.ts:3-9  ↔  src/commands/hist.ts:3-9   (7 lines)
src/commands/clear.ts:3-9  ↔  src/commands/close.ts:3-9  (7 lines)
src/recognizers/bash.ts:1-6  ↔  src/recognizers/db.ts:1-6  (6 lines)
src/browser.test.ts:1-5  ↔  src/shell.test.ts:1-5   (5 lines)
```

---

## Phase 3 — Configuration

### Create `.jscpd.json`

```json
{
  "minLines": 5,
  "minTokens": 50,
  "maxLines": 500,
  "maxSize": "100kb",
  "mode": "mild",
  "format": ["typescript", "tsx"],
  "ignore": [
    "**/*.d.ts",
    "**/node_modules/**",
    "**/dist/**",
    "**/web/dist/**",
    "**/.janissary/**"
  ],
  "ignorePattern": [
    "import type \\{.*\\} from",
    "^\\s*$"
  ],
  "reporters": ["json", "console-full"],
  "threshold": 5
}
```

| Field | Purpose |
|---|---|
| `minLines` | Minimum clone length (5 lines catches command handler boilerplate) |
| `minTokens` | Minimum tokens (higher = fewer false positives) |
| `mode` | `mild` detects structural clones (same shape, diff names) |
| `format` | Restrict to TypeScript/TSX |
| `ignore` | Skip generated files and build output |
| `ignorePattern` | Regex to skip irrelevant patterns (type imports, blank lines) |
| `threshold` | Max duplication percentage before non-zero exit |

### Separate client config — `.jscpd.client.json`

```json
{
  "minLines": 5,
  "minTokens": 50,
  "mode": "mild",
  "format": ["typescript", "tsx"],
  "ignore": ["**/*.d.ts", "**/node_modules/**", "**/dist/**"],
  "reporters": ["json", "console-full"],
  "threshold": 3
}
```

---

## Phase 4 — npm Scripts

```json
{
  "scripts": {
    "duplication": "npm run duplication:server && npm run duplication:client",
    "duplication:server": "jscpd src/ --output docs/duplication/server.json --reporters json,console-full",
    "duplication:client": "jscpd web/src/ --output docs/duplication/client.json --reporters json,console-full",
    "duplication:report": "npm run duplication:server && npm run duplication:client && npx tsx scripts/duplication-report.ts",
    "duplication:baseline": "jscpd src/ --output docs/duplication/baseline-server.json && jscpd web/src/ --output docs/duplication/baseline-client.json"
  }
}
```

Usage:

| Command | What it does |
|---|---|
| `npm run duplication` | Full scan (server + client), terminal + JSON output |
| `npm run duplication:server` | Server only, clones listed in terminal |
| `npm run duplication:client` | Client only, clones listed in terminal |
| `npm run duplication:report` | Full scan + generate ranked refactoring report |
| `npm run duplication:baseline` | Save initial baselines |

---

## Phase 5 — Refactoring Guidance Script

`scripts/duplication-report.ts` processes the jscpd JSON output and produces a ranked plan organized by refactoring opportunity:

```
Duplication: 3.2% (14 clones across 45 source files)

Priority 1 — Template boilerplate (7 clones, 12% of all duplication)
  Pattern:  export const command: Command = { name, match, handler }
  Files:    src/commands/clear.ts, next.ts, hist.ts, close.ts
  Lines:    7 lines each, identical structure
  Fix:      Use a helper factory: `defineCommand('clear', handler)`

Priority 2 — Test boilerplate (3 clones)
  Pattern:  describe('x command') / it('matches "x"') / it('does not match')
  Files:    src/commands/clear.test.ts, next.test.ts, close.test.ts
  Lines:    20 lines each
  Fix:      Generate tests from a shared template or use test.each

Priority 3 — Recognizer skeleton (2 clones)
  Pattern:  Set + export const xyzRecognizer: CommandRecognizer
  Files:    src/recognizers/bash.ts, db.ts, acp.ts
  Lines:    6 lines each (imports + type annotation)
  Fix:      Extract shared RecognizerFactory or base class

Priority 4 — Test context literal (2 clones)
  Pattern:  const noDb = { openDbs: [] as string[] }
  Files:    src/recognizers/bash.test.ts, db.test.ts, acp.test.ts
  Lines:    1 line each
  Fix:      Move to a shared test helper or beforeEach
```

Run with:

```bash
npx tsx scripts/duplication-report.ts --threshold 3
```

The script cross-references `--threshold` to flag files whose individual duplication ratio exceeds the target.

---

## Phase 6 — Cross-Reference with FTA Quality Scores

The real insight comes from combining duplication data with complexity scores. `scripts/duplication-report.ts` can also read `docs/quality/server.json` (from FTA) to produce a matrix:

```
High-value refactoring targets (complex + duplicated):

  src/commands/*.ts (17 files)
    FTA score: 15-20 (OK — low complexity)
    Duplication: 12% of files is boilerplate skeleton
    Verdict:  LOW value — the boilerplate is lightweight.
    Action:   Consider factory helper, but low urgency.

  src/recognizers/*.ts (3 files)
    FTA score: 25-35 (OK)
    Duplication: 8% shared skeleton
    Verdict:  MEDIUM value — small files, low complexity.
    Action:   Quick win with a shared base class.

  src/controller.ts
    FTA score: 61.6 (Needs improvement — highest in codebase)
    Duplication: 0% (unique file)
    Verdict:  Complexity is from size, not duplication.
    Action:   Refactor into smaller modules (no duplication fix).
```

This prevents wasting effort on low-impact deduplication (the command boilerplate is tiny and cheap) and focuses on patterns that actually reduce maintenance burden.

---

## Phase 7 — Outputs & Reports

| File | Purpose |
|---|---|
| `docs/duplication/server.json` | Server scan (gitignored) |
| `docs/duplication/client.json` | Client scan (gitignored) |
| `docs/duplication/baseline-server.json` | Committed server baseline |
| `docs/duplication/baseline-client.json` | Committed client baseline |
| `.jscpd.json` | Shared config |
| `.jscpd.client.json` | Client-only config |

---

## Directory Layout

```
.jscpd.json
.jscpd.client.json
docs/
└── duplication/
    ├── baseline-server.json    # committed
    ├── baseline-client.json    # committed
    ├── server.json             # latest (gitignored)
    └── client.json             # latest (gitignored)
scripts/
    └── duplication-report.ts  # ranked refactoring guidance
```

---

## Summary

| Layer | Tool | What it measures | Run command |
|---|---|---|---|
| Server duplication | jscpd v5 | Clone count, duplication %, per-file breakdown | `npm run duplication:server` |
| Client duplication | jscpd v5 | Clone count, duplication %, per-file breakdown | `npm run duplication:client` |
| Refactoring guidance | `scripts/duplication-report.ts` | Ranked list cross-referenced with FTA complexity scores | `npm run duplication:report` |
| Baseline | JSON snapshots | Track duplication % over time | `npm run duplication:baseline` |

Key metrics tracked:
- **Total duplication percentage** — overall codebase health
- **Clone count** — number of distinct duplicate pairs
- **Clone lines** — lines of duplicated code
- **Per-file duplication ratio** — hotspot identification
- **Cross-reference with FTA score** — prioritize high-complexity high-duplication files
