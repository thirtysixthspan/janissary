# Security checks

Three automated checks run in `npm run security`: security-focused lint rules, secrets scanning, and dependency CVE auditing. The checks are wired into a pre-push git hook so they run automatically before every push.

```bash
npm run security          # lint + secrets + deps (pre-push gate)
npm run security:deps     # npm audit --omit=dev (dependency CVEs)
npm run security:secrets  # gitleaks scan (requires gitleaks: brew install gitleaks)
npm run security:sast     # Opengrep one-time audit → security-audit.sarif (on demand)
```

## Security lint

`eslint-plugin-security` adds three targeted rules to the existing `npm run lint`:

| Rule | Severity | What it catches |
| ---- | -------- | --------------- |
| `detect-unsafe-regex` | error | Regexes with catastrophic backtracking potential (ReDoS) |
| `detect-eval-with-expression` | error | `eval()` called with a non-literal expression |
| `detect-non-literal-fs-filename` | warning | `fs.*` calls with dynamic (variable) paths — review each hit |

`detect-child-process` is intentionally off: the app's shell/git/glob exec on local-user input is the product, not a vulnerability.

## Secrets scanning

[gitleaks](https://github.com/gitleaks/gitleaks) scans the working tree and git history for committed credentials. Install it separately (it is a standalone binary — not an npm package):

```bash
brew install gitleaks    # macOS
# or: https://github.com/gitleaks/gitleaks/releases
```

The pre-commit hook calls `gitleaks protect --staged` to block newly staged secrets before they land in history. The pre-push hook re-runs the full tree scan via `npm run security`.

## Dependency CVE audit

`npm run security:deps` runs `npm audit --omit=dev` against the lock file. No extra tooling — uses npm's built-in auditing.

## SAST (on demand)

`npm run security:sast` runs [Opengrep](https://github.com/opengrep/opengrep) (must be installed separately) across `src/` and `web/src/` and writes a SARIF report to `security-audit.sarif`. This is a broad, one-time audit with expected false positives — review the output by hand rather than gating CI on it.

## Threat model

Severity is driven by trust boundaries, not by how scary the sink looks:

| Source | Trust | Implication |
| ------ | ----- | ----------- |
| Local user typing in their terminal | Trusted | Shell/SQL/git exec on user input is the product. |
| ACP agent output rendered in the web client | Untrusted | Agent-controlled markdown/HTML; sanitized by DOMPurify. |
| Agent/tab names flowing into file paths | Semi-trusted | Validated against `/^[\w-]+$/` before any `path.join`. |
| Anything reachable over the bound port | Untrusted | Mitigated by loopback allow-list + session token + CSP headers. |

The ACP tool loop is sandboxed to `db` and `browser` commands — agents cannot invoke shell, `open`, or git clone.

## Inline suppression

When a lint finding is intentional, suppress it inline with a reason co-located with the code (not in a separate file):

```ts
// Intentional: user-driven shell glob; only the local user reaches this sink.
// eslint-disable-next-line security/detect-child-process
const res = spawnSync(SHELL_NAME, ['-c', expr], { cwd, encoding: 'utf8' });
```
