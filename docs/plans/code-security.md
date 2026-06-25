# Code Security Assessment Plan

## Current State

### Security-relevant attack surfaces

| Surface | File | Risk |
|---|---|---|
| Shell command injection | `src/controller.ts:546` | User glob pattern interpolated into shell command string |
| Shell command injection | `src/workspace.ts:33` | `repoPath` interpolated into `git clone --shared` |
| SQL injection | `src/db.ts:137,141` | User SQL executed verbatim via `node:sqlite` |
| Path traversal (agent state) | `src/agent-state.ts:16` | Agent name in file path without validation |
| Markdown XSS | `web/src/Transcript.tsx:14,20` | ACP output rendered as Markdown (mitigated by DOMPurify) |
| Missing CSP | `src/index.ts:69` | No Content-Security-Policy on HTTP responses |
| Token in URL | `src/index.ts:114`, `web/src/ImageTab.tsx` | Session token in query parameter |

### Existing defenses

| Defense | Where | Status |
|---|---|---|
| Token auth (constant-time compare) | `src/security.ts` | ✅ |
| Origin allow-list (loopback only) | `src/security.ts` | ✅ |
| Token required for file serving | `src/index.ts:46-47` | ✅ |
| File path allow-list for `/open/<id>` | `src/controller.ts:83` | ✅ |
| Static file path traversal guard | `src/index.ts:59-61` | ✅ |
| DOMPurify for Markdown HTML | `web/src/Transcript.tsx:14` | ✅ |
| DB name validation (regex) | `src/db.ts:59` | ✅ |

### Test & lint coverage

| Layer | Tool | Status |
|---|---|---|
| Correctness linting | ESLint (basic + typescript-eslint) | Partially covers security (no-unsafe-assignment is warn) |
| Security SAST | None | ❌ |
| Dependency audit | None | ❌ |
| Secrets scanning | None | ❌ |

## Tool Selection

**Opengrep** is the optimal choice. It is a fully open-source (LGPL 2.1) fork of Semgrep, created when Semgrep moved critical SAST features behind a commercial license.

| Factor | Opengrep | Semgrep CE | Other tools |
|---|---|---|---|
| License | LGPL 2.1 (fully open) | LGPL 2.1 (but features removed) | Various |
| JS/TS support | ✅ Full (JSX, TSX) | ✅ Full | Varies |
| Taint analysis (intrafile) | ✅ Cross-function | ❌ (Pro only) | Stryx (limited) |
| Semgrep rule compatible | ✅ 2000+ rules | ✅ 2000+ rules | N/A |
| JSON / SARIF output | ✅ | ✅ | Varies |
| Self-contained binary | ✅ (no Python) | ❌ (needs Python) | Varies |
| Speed | Fast (OCaml) | Moderate | Varies |
| Community | Growing (consortium-backed) | Large but feature-gated | Niche |

**Why not alternatives:**
- **Semgrep CE** — critical features removed behind paywall (cross-function taint, many languages)
- **Stryx** — promising but very new, narrow focus on backend patterns only
- **NodeSecure/js-x-ray** — focused on supply chain / malicious packages, not general SAST
- **CodeSlick** — pre-commit focused, fewer rules

**Supplementary for dependency scanning:** `npm audit` (already available via npm) covers known CVE checking for dependencies at no extra cost.

---

## Phase 1 — Install Opengrep

```bash
curl -fsSL https://raw.githubusercontent.com/opengrep/opengrep/main/install.sh | bash
```

This installs a self-contained binary to `/usr/local/bin/opengrep`. No Python or runtime dependencies needed.

Verify:

```bash
opengrep --version
```

---

## Phase 2 — Initial Baseline Scans

### 2.1 Full security scan on server code

```bash
opengrep scan --config p/security-audit --config p/typescript --config p/javascript \
  --output docs/security/server-baseline.json --json src/
```

### 2.2 Full security scan on client code

```bash
opengrep scan --config p/security-audit --config p/typescript --config p/javascript \
  --output docs/security/client-baseline.json --json web/src/
```

### 2.3 Review findings

Each finding includes:
```
{
  "check_id": "typescript.lang.security.audit.detect-non-literal-require",
  "path": "src/controller.ts",
  "start": { "line": 546, "col": 9 },
  "end": { "line": 549, "col": 14 },
  "extra": {
    "message": "Detected non-literal argument to spawnSync",
    "severity": "WARNING",
    "metadata": {
      "cwe": ["CWE-78"],
      "references": ["https://owasp.org/www-community/attacks/Command_Injection"]
    }
  }
}
```

---

## Phase 3 — Custom Rules for Codebase-Specific Risks

Opengrep uses YAML rules. Create `opengrep-rules/` with rules tuned to this repo's architecture.

### `opengrep-rules/shell-injection.yaml`

```yaml
rules:
  - id: janissary-shell-injection
    patterns:
      - pattern-either:
          - pattern: spawnSync($SHELL, ["-c", ...], ...)
          - pattern: spawn($SHELL, ["-lc", $CMD], ...)
          - pattern: execSync(...)
    message: >
      Shell command constructed from user input. Ensure the command string
      is validated or use safe APIs (spawn with argument array, not -c).
    languages: [ts, js]
    severity: WARNING
```

### `opengrep-rules/file-path-traversal.yaml`

```yaml
rules:
  - id: janissary-path-traversal
    patterns:
      - pattern-either:
          - pattern: join($DIR, ...)
          - pattern: resolve($DIR, ...)
    message: >
      File path constructed from user-influenced data. Validate the
      input does not contain path traversal sequences (../).
    languages: [ts, js]
    severity: WARNING
```

### `opengrep-rules/sql-execution.yaml`

```yaml
rules:
  - id: janissary-sql-execution
    patterns:
      - pattern: db.prepare($QUERY).all()
      - pattern: db.prepare($QUERY).run()
      - pattern: db.exec($QUERY)
    message: >
      SQL executed directly. If $QUERY contains user or agent input,
      this is SQL injection. Use prepared statements with parameters.
    languages: [ts, js]
    severity: WARNING
```

Run custom rules:

```bash
opengrep scan --config opengrep-rules/ --config p/security-audit \
  --output docs/security/custom-findings.json --json src/ web/src/
```

---

## Phase 4 — npm Scripts

```json
{
  "scripts": {
    "security": "npm run security:server && npm run security:client && npm run security:deps",
    "security:server": "opengrep scan --config p/security-audit --config p/typescript --config p/javascript --config opengrep-rules/ --output docs/security/server.json --json src/",
    "security:client": "opengrep scan --config p/security-audit --config p/typescript --config opengrep-rules/ --output docs/security/client.json --json web/src/",
    "security:deps": "npm audit --json > docs/security/deps.json 2>/dev/null; echo 'Dependency audit complete'",
    "security:report": "npm run security:server && npm run security:client && npx tsx scripts/security-report.ts",
    "security:custom": "opengrep scan --config opengrep-rules/ --output docs/security/custom.json --json src/ web/src/"
  }
}
```

Usage:

| Command | What it does |
|---|---|
| `npm run security` | Full security assessment (server + client + deps) |
| `npm run security:server` | SAST scan on `src/` with security + language rules |
| `npm run security:client` | SAST scan on `web/src/` with security + language rules |
| `npm run security:deps` | `npm audit` for dependency vulnerabilities |
| `npm run security:report` | Full SAST scan + generate refactoring report |
| `npm run security:custom` | Custom rules only (codebase-specific patterns) |

---

## Phase 5 — Refactoring Guidance Script

`scripts/security-report.ts` processes the Opengrep JSON output and produces a ranked action plan:

```
Priority 1 — Command Injection (src/controller.ts:546)
  Rule:      typescript.lang.security.audit.detect-non-literal-require
  Severity:  WARNING
  CWE:       CWE-78 (OS Command Injection)
  Finding:   User-supplied glob pattern interpolated into
             `spawnSync(SHELL_NAME, ['-c', 'for f in ${pattern}...'])`
  Fix:       Use `glob` library instead of shell expansion, or
             validate pattern with a strict allow-list before
             passing to the shell.

Priority 2 — SQL Injection (src/db.ts:137)
  Rule:      janissary-sql-execution
  Severity:  WARNING
  Finding:   `db.prepare(query).all()` with user-supplied query
  Fix:       For read-only user queries, use a read-only connection
             or parse the query to verify it starts with SELECT/PRAGMA.
             For agent queries, sandbox the SQLite database.

Priority 3 — Path Traversal (src/agent-state.ts:16)
  Rule:      janissary-path-traversal
  Severity:  WARNING
  Finding:   Agent name used in file path without traversal validation
  Fix:       Validate agent name against /^[a-zA-Z0-9_-]+$/ before
             constructing the path.
```

Run with:

```bash
npx tsx scripts/security-report.ts
```

---

## Phase 6 — Suppression & Tuning

Not every Opengrep finding is actionable. Suppress known-safe patterns:

### `opengrep-suppressions.yaml`

```yaml
# Intentional shell execution — the app is a shell. The command string
# is user-typed and the user controls the shell, so injection is by design.
suppressions:
  - path: src/shell.ts
    check_id: typescript.lang.security.audit.detect-non-literal-require
    reason: Intentional user shell execution
  - path: src/pty.ts
    check_id: typescript.lang.security.audit.detect-non-literal-require
    reason: Intentional PTY spawn for interactive programs
  - path: src/interactive.ts
    check_id: typescript.lang.security.audit.detect-non-literal-require
    reason: Intentional PTY spawn for interactive programs
```

Run with suppression:

```bash
opengrep scan --config p/security-audit --suppressions opengrep-suppressions.yaml src/
```

---

## Phase 7 — Outputs & Reports

| File | Purpose |
|---|---|
| `docs/security/server.json` | Server SAST findings (machine-readable) |
| `docs/security/client.json` | Client SAST findings (machine-readable) |
| `docs/security/custom.json` | Findings from codebase-specific custom rules |
| `docs/security/deps.json` | `npm audit` dependency vulnerability report |
| `opengrep-rules/*.yaml` | Custom rules for this codebase |
| `opengrep-suppressions.yaml` | Suppressed findings with reasons |

---

## Directory Layout

```
opengrep-rules/
├── shell-injection.yaml
├── file-path-traversal.yaml
└── sql-execution.yaml
opengrep-suppressions.yaml
docs/security/
├── server.json            # latest server scan (gitignored)
├── client.json            # latest client scan (gitignored)
├── custom.json            # custom rules findings (gitignored)
├── deps.json              # npm audit output (gitignored)
├── server-baseline.json   # committed baseline snapshot
└── client-baseline.json   # committed baseline snapshot
scripts/
└── security-report.ts     # ranked refactoring guidance from Opengrep findings
```

---

## Summary

| Layer | Tool | What it detects | Run command |
|---|---|---|---|
| First-party SAST | Opengrep | Shell injection, path traversal, SQL injection, XSS, unsafe crypto, bad patterns | `npm run security` |
| Custom codebase rules | Opengrep (YAML) | Janissary-specific: spawn patterns, path joins, db.exec calls | `npm run security:custom` |
| Dependency audit | `npm audit` | Known CVEs in dependencies | `npm run security:deps` |
| Refactoring guidance | `scripts/security-report.ts` | Ranked priority list with fix recommendations | `npm run security:report` |
