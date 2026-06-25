# Code Security Assessment Plan

## Threat model first (the part that makes findings actionable)

This app is a **terminal shell, a browser driver, and a SQL runner**. Spawning shells, cloning repos, and executing SQL are the *product*, not vulnerabilities. A generic SAST tool will flag all of them; most are intentional. To avoid drowning real issues in noise, every finding is triaged against one question:

> **Does untrusted input reach this sink?**

The trust boundary for Janissary:

| Source | Trust | Notes |
|---|---|---|
| The local user typing in their own terminal | **Trusted** | They already have a shell. `db`, `open`, shell exec on their own input is the product. |
| ACP agent output rendered in the web client | **Untrusted** | A model can emit arbitrary markdown/HTML. This is the primary untrusted channel. |
| Agent/tab **names** that flow into file paths | **Semi-trusted** | Validate defensively — a name reaching a filesystem path is a traversal sink. |
| Anything reachable over the bound port | **Untrusted** | Mitigated today by loopback origin allow-list + session token. |

Severity is driven by this table, **not** by how scary the sink looks in isolation. Shell/SQL exec on local-user input is low priority; agent-controlled markdown and agent-controlled names reaching the DOM/filesystem are high.

---

## Current State

> ⚠️ **References below are keyed to `file:function`, not bare line numbers.** These files churn heavily (in the last 50 commits: `controller.ts` 9×, `agent-state.ts` 7×, `workspace.ts` 5×). The previous draft of this plan cited `src/db.ts:137` — that file has since been split into `src/database.ts` and `src/commands/db.ts`, so the reference was already dead. **Verify the symbol exists before acting on any row.**

### Security-relevant attack surfaces (verified 2026-06-25)

| Surface | Location (symbol) | Untrusted input reaches it? | Priority |
|---|---|---|---|
| Markdown → HTML XSS | `web/src/Transcript.tsx` → `render()` (`marked.parse` → `dangerouslySetInnerHTML`) | **Yes** — ACP agent output | **High** (mitigated by DOMPurify — verify config) |
| Path traversal | `src/agent-state.ts` → `agentStatePath(name)` (`join(dir, \`${name}.json\`)`, no validation) | **Maybe** — agent/tab name | **High** |
| DB name → path | `src/connections.ts` → `dbPath(name)` (`join(dbDir, \`${name}.sqlite\`)`, no validation) | **Maybe** — connection name | **Medium** (missed by previous draft) |
| Missing CSP | `src/index.ts` → static response handler (no `Content-Security-Policy` header) | n/a (defense-in-depth for the XSS path above) | **Medium** |
| Token in URL | `src/index.ts` → `startServer` return (`?token=...`), `web/src/ImageTab.tsx` | Leak via referrer/logs/history | **Medium** |
| Shell glob injection | `src/controller.ts` → `expandGlob(pattern, cwd)` (`spawnSync(SHELL_NAME, ['-c', \`for f in ${pattern}…\`])`) | Local user only (unless an agent can drive `open`) | **Low\*** |
| Git clone injection | `src/workspace.ts` → `createWorkspace(name, repoPath)` (`execSync(\`git clone --shared "${repoPath}" "${target}"\`)`) | Local user only (unless agent-driven) | **Low\*** |
| SQL execution | `src/database.ts` → `database.prepare(query)` / `database.exec(query)` | Local user only (unless agent-driven) | **Low\*** |

> **\* The single most important open question:** can an **ACP agent** cause the controller to run `open <glob>`, `db <sql>`, or a workspace clone with attacker-influenced arguments? If yes, every Low\* row jumps to High. Resolve this before scanning — it decides the whole priority order. (Check what command strings an agent can inject through `src/controller.ts` / `src/acp*.ts`.)

### Existing defenses (verified)

| Defense | Where | Status |
|---|---|---|
| Token auth (constant-time compare) | `src/security.ts` → `tokenMatches` | ✅ |
| Origin allow-list (loopback only) | `src/security.ts` → `originAllowed` | ✅ |
| Token required for `/open` file serving | `src/index.ts` (`tokenMatches(token, tokenFromRequest(req))`) | ✅ |
| WebSocket origin + token check | `src/index.ts` (upgrade handler) | ✅ |
| `/open/<id>` allow-list (no arbitrary paths) | `src/controller.ts` → `registerOpen` / `openPath` | ✅ |
| Static-file traversal guard | `src/index.ts` (`normalize().replace(/^(\.\.[/\\])+/, '')` + `startsWith(webDir)`) | ✅ |
| DOMPurify on agent markdown | `web/src/Transcript.tsx` → `DOMPurify.sanitize(marked.parse(...))` | ✅ (verify allowed tags/attrs) |
| ~~DB name validation (regex)~~ | claimed `src/db.ts:59` | ❌ **Not found** — `dbPath(name)` has no guard. Either re-add it or treat the DB-name row above as open. |

### Tooling coverage

| Layer | Tool | Status |
|---|---|---|
| Correctness linting | ESLint + typescript-eslint | Partial; not security-focused |
| Security SAST | None | ❌ |
| Dependency audit | None | ❌ |
| Secrets scanning | None | ❌ (the previous draft flagged this and then never addressed it) |

---

## Strategy: fix-first, then gate

The surfaces above are **already known**. A scanner that re-discovers them is motion without progress. So the work order is:

1. **Phase 1 — Remediate the known High/Medium surfaces** (with regression tests). This is where the security improvement actually happens.
2. **Phase 2 — Stand up a lightweight, low-noise gate** so *new* issues are caught going forward.
3. **Phase 3 — One-time broad audit** to surface anything the manual review missed.

A scanner is Phase 2/3, not Phase 1.

---

## Phase 1 — Remediate known surfaces (do this first)

Each item is a concrete change plus the test that locks it in. Tests matter more than the scanner: they encode the decision and never produce false positives.

| # | Surface | Fix | Regression test |
|---|---|---|---|
| 1 | `agentStatePath(name)` traversal | Reject names not matching `/^[A-Za-z0-9_-]+$/` (or basename-and-confirm-within-dir) before building the path | Assert `agentStatePath('../../etc/x')` throws / is rejected |
| 2 | `dbPath(name)` traversal | Same name validation as #1 | Assert a `..`-containing connection name is rejected |
| 3 | Markdown XSS | Confirm DOMPurify config forbids `javascript:`/event handlers and that `marked` isn't bypassed; pin an allow-list of tags if not already | Feed `<img src=x onerror=alert(1)>` and `[x](javascript:...)` through `render()`, assert sanitized |
| 4 | Missing CSP | Add a strict `Content-Security-Policy` (e.g. `default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'`) to the static/HTML response | Assert the header is present on `/` |
| 5 | Token in URL | Decide & document: move token to `Authorization`/cookie, or accept the loopback-only risk explicitly with a comment. At minimum set `Referrer-Policy: no-referrer` | Assert `Referrer-Policy` header present |
| 6 | Shell/SQL/git sinks | **Only if Phase 0 shows an agent can drive them.** Then: validate/escape, or gate behind explicit user confirmation. If they're local-user-only, add a one-line comment documenting the intentional trust boundary so the scanner finding can be suppressed with a reason | Per sink, as applicable |

Land these before adding the scanner so the first scan reflects the *fixed* state, not a baseline full of issues you already plan to fix.

---

## Phase 2 — Standing gate (low-noise, runs every change)

Three cheap, high-signal tools. None require GitHub (this repo has no remote) or a running service.

### 2.1 Security lint — author-time, zero new infra

Add **`eslint-plugin-security`** to the **existing** `eslint.config.mjs` rather than building a parallel pipeline. It flags new dangerous patterns (`child_process` with non-literals, `fs` with tainted paths, non-literal RegExp) the moment they're written, inside the `npm run lint` you already run.

```bash
npm install --save-dev eslint-plugin-security
```

Enable only the rules that fit (it's noisy by default in a shell app — turn off `detect-child-process` if it just re-flags the intentional sinks, keep `detect-non-literal-fs-filename`, `detect-unsafe-regex`, etc.).

### 2.2 Secrets scanning — the gap the old plan never filled

**`gitleaks`** (single Go binary, offline) scans the tree and history for committed credentials. This is the one category generic SAST doesn't cover and the previous plan left unaddressed.

```bash
gitleaks detect --no-banner --redact      # working tree + history
gitleaks protect --staged --no-banner      # pre-commit: block new secrets
```

### 2.3 Dependency CVEs

`npm audit` is already available (zero install). For an offline/airtight alternative use **`osv-scanner`** against `package-lock.json`. Keep this; it's cheap.

```bash
npm audit --omit=dev
```

---

## Phase 3 — One-time SAST audit (broad, manual review)

For a deeper sweep, run a SAST engine once and triage by hand. **Opengrep** is the right engine *for this repo specifically*: the repo has **no GitHub remote**, so CodeQL (GitHub-Actions-only, and the strongest free option) is unavailable; Semgrep CE has cross-function taint paywalled; Opengrep is a self-contained binary that runs offline. (If you later push to GitHub, switch this phase to **CodeQL** — better taint analysis, maintained, results in the Security tab, no local binary to babysit.)

```bash
curl -fsSL https://raw.githubusercontent.com/opengrep/opengrep/main/install.sh | bash
opengrep --version
```

Run the **default** rulesets for the gate-style pass, and reserve the noisy **audit** pack for the one-time manual review:

```bash
# One-time broad audit (expect false positives — review by hand, don't gate on it)
opengrep scan --config p/javascript --config p/typescript --config p/nodejs \
  --config p/security-audit --sarif --output security-audit.sarif src/ web/src/
```

Use `--sarif` (or `--json`) and read it directly — Opengrep already groups by rule and severity, so **no bespoke ranking script is needed.** (The previous draft's `scripts/security-report.ts` was new unmaintained code that re-implemented what the reporter already does — dropped.)

### Custom rules — only if they target a real sink, written against the real shape

The previous draft's custom rules were written without checking the code and would have failed:

- `pattern: join($DIR, ...)` matches *almost every* `path.join` in 6k LOC — a false-positive flood. **Drop it**; Phase 1 #1/#2 (validation + tests) covers traversal far better than a rule that cries wolf on every join.
- `pattern: db.prepare($QUERY).all()` never matches the real sink `database.prepare(query)` (receiver is `database`, not `db`). Use a metavariable for the receiver.
- The shell rule used `["-lc", $CMD]`, but the real sink is `['-c', \`for f in ${pattern}…\`]` — wrong flag, and a template literal won't bind a bare metavariable.

If you keep any custom rule, target the actual sinks:

```yaml
# opengrep-rules/sql-exec.yaml — matches `database.prepare(query)` and `database.exec(query)`
rules:
  - id: janissary-sql-exec
    patterns:
      - pattern-either:
          - pattern: $DB.prepare($Q).all()
          - pattern: $DB.prepare($Q).run()
          - pattern: $DB.exec($Q)
    message: SQL executed from a variable. Confirm $Q is local-user input, not agent/remote.
    languages: [ts]
    severity: INFO   # INFO, not WARNING — it's the product unless Phase 0 says otherwise
```

---

## Phase 4 — Minimal npm scripts

Collapse to what's actually maintained. No committed baseline JSONs, no per-area split, no report script.

```json
{
  "scripts": {
    "security": "npm run lint && npm run security:secrets && npm run security:deps",
    "security:secrets": "gitleaks detect --no-banner --redact",
    "security:deps": "npm audit --omit=dev",
    "security:sast": "opengrep scan --config p/javascript --config p/typescript --config p/nodejs --sarif --output security-audit.sarif src/ web/src/"
  }
}
```

| Command | Purpose | Cadence |
|---|---|---|
| `npm run security` | lint (incl. eslint-plugin-security) + secrets + deps | every change / pre-push |
| `npm run security:sast` | broad Opengrep audit → SARIF for manual review | periodic / on demand |

Since there's no CI, wire `npm run security` into a **pre-push git hook** so the gate actually runs. Add `gitleaks protect --staged` as a pre-commit hook to block new secrets at the source.

---

## Suppressions (when you genuinely keep a flagged-but-intentional sink)

For Opengrep, use inline `// nosemgrep: <rule-id>` comments **with a reason on the line above**, co-located with the code — not a separate suppressions file that drifts out of sync:

```ts
// Intentional: user-driven shell glob; only the local user (who already owns this shell) reaches it.
// nosemgrep: javascript.lang.security.detect-child-process
const res = spawnSync(SHELL_NAME, ['-c', expr], { cwd, encoding: 'utf8', timeout: 5000 });
```

Inline suppression keeps the justification next to the code, so it travels with refactors instead of pointing at a stale line number — the exact failure mode that broke the old plan's `db.ts:137` reference.

---

## Summary

| Phase | Action | Tool | Output |
|---|---|---|---|
| 0 | Answer: can an agent drive shell/SQL/git sinks? | manual code read | re-rank Low\* rows |
| 1 | **Fix** known High/Med surfaces + regression tests | hand-written code + vitest | real risk reduction |
| 2 | Standing gate: security lint, secrets, deps | eslint-plugin-security, gitleaks, npm audit | `npm run security` |
| 3 | Periodic broad SAST audit (manual triage) | Opengrep (CodeQL if/when on GitHub) | `security-audit.sarif` |

The shift from the previous draft: **fix the already-known issues first**, drive severity from a **threat model** (untrusted = agent output, not the local user), integrate security checks into the **existing lint/hook** flow instead of a bespoke parallel pipeline, **add the missing secrets track**, and **drop** the stale line-number references, the buggy custom rules, the committed baselines, and the homegrown report script.
