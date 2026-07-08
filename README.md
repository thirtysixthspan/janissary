# Janissary

A [Janissary](https://en.wikipedia.org/wiki/Janissary) was an elite infantry soldier in the Ottoman Empire — a servant of the gate, loyal, and ever-ready. 

Janissary is an **Agentic Working Environment**. In other words, it is an application for supporting your work using AI agents.

See the [documentation site](https://thirtysixthspan.github.io/janissary/) for the full command reference, tab types, and automation/advanced-agent guides. Once running, type `help` for a quick command and key-binding summary.

## Prerequisites

- macOS
- Node.js 24+
- Google Chrome 

## Usage

```
npx janus
```

Or install globally:

```
npm install -g janissary
janus
```

See [`help.md`](help.md) for the full in-app command and key-binding reference (the same
content the `help` command prints), and the [documentation site](https://thirtysixthspan.github.io/janissary/)
for tab types, automation, and advanced-agent guides.

## Security

### Workspace sandbox (macOS only)

A workspaced tab (`agent -w` / `harness -w`) confines its processes — the tab's shell, harness PTY, or ACP session, and anything they spawn — to the workspace directory using a kernel-enforced Seatbelt sandbox (`sandbox-exec`):

- **Writes** are denied everywhere except the workspace and its private temp dir, plus a narrow set of harness-state carve-outs (`~/.claude/projects`, `~/.claude/session-env`, `~/.claude.json`, `~/.codex`, `~/.config/opencode`, and a few package-manager caches) and two fixed OS-level paths a harness needs regardless of `$HOME`: the real per-user Darwin cache directory (a legacy Keychain subsystem locks a file there) and the harness CLI's own scratchpad directory (`/private/tmp/claude-<uid>/`, created before *every* tool call — without this carve-in, no Bash tool call works inside a workspaced tab at all). Never the whole `~/.claude`, `~/.cache`, or `~/.npm` — broad cache write access would let a sandboxed agent poison packages a non-sandboxed process later consumes.
- **Reads** of `$HOME`'s contents are denied by default and carved back in only for the write carve-outs above, plus `~/.gitconfig`, `~/.config/gh/config.yml` (`gh`'s general settings — not `hosts.yml`, which stays denied), `~/.claude/settings.json`, and `~/Library/Keychains` (needed so a harness can look up its own OAuth credential — see [Known limitations](#known-limitations) below). System paths (`/usr`, language runtimes, Homebrew) stay readable, as does a harness's own executable directory even when it lives under `$HOME` (nvm, `~/.opencode/bin`, …).
- A fixed list of secret paths is denied even inside a carve-in: `.ssh`, `.aws`, `.gnupg`, `.kube`, `.netrc`, cloud CLI configs (`gh` hosts.yml, `gcloud`, `azure`, `docker`), credential files for Cargo/PyPI/Maven/Terraform, shell/REPL history files, and browser profile directories (Chrome, Firefox, Brave, Safari).
- **Environment variables** that could bypass the file-read denies above are stripped before spawn: `AWS_*`, `GITHUB_TOKEN`, `GH_TOKEN`, `NPM_TOKEN`, `DOCKER_*`, `KUBECONFIG`, anything ending `_SECRET`/`_PASSWORD`, `SSH_AUTH_SOCK`, `GPG_AGENT_INFO`, `GNUPGHOME`, `GIT_ASKPASS`, `GIT_CREDENTIAL_HELPER`, `KRB5CCNAME`. LLM provider keys (`ANTHROPIC_*`, `OPENAI_*`, `GEMINI_*`/`GOOGLE_*`) are deliberately kept — the harnesses need their own credentials to function. A `JANISSARY_NODE` variable is added, set to the janissary server's own Node binary path — so a script inside the sandbox (e.g. a project's own `.claude/settings.json` hook) can invoke a known-good `node` without depending on `PATH` resolution inside the sandboxed context. If a scoped GitHub token is configured (see "GitHub push/PR access" below), `GH_TOKEN` is re-added after the strip, set to that token — the one deliberate exception, since it's a fresh value chosen for that workspace, not the ambient one just removed — and `GH_CONFIG_DIR` is pointed at an empty, workspace-private directory, since `gh` reads `~/.config/gh/hosts.yml` on every invocation regardless of `GH_TOKEN` and treats the sandbox's deny on that file as a fatal error rather than falling back; redirecting `GH_CONFIG_DIR` gives it a genuinely absent `hosts.yml` instead.
- **Network** is allowed by default; add `--offline` to a workspaced tab to deny it instead:

  ```
  harness claude -w --offline    → workspaced harness tab with no network access
  ```

**Practical consequences.** No global installs, no reading sibling workspaces/other repos/dotfiles outside the carve-ins above. `git commit`/`fetch`/`pull`, `npm install`, builds, venvs, and harness login all work normally inside the workspace. The workspace's `origin` is HTTPS, pointed directly at GitHub — `git push` and `gh` (PR create/merge) work from inside the sandbox too, if a scoped GitHub token is configured (below); without one they fail, since `.ssh` is denied and `SSH_AUTH_SOCK` is stripped.

**GitHub push/PR access.** To let workspaced tabs `git push` and use `gh` (PR create/merge), create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) scoped to just this repo, with **Contents: Read and write**, **Pull requests: Read and write**, and **Metadata: Read-only** permissions — nothing broader. Save it to `.janissary/github-token` (already gitignored; janissary only reads this file, never writes it). Without this file, workspaces still work for local development, just not pushing/PR operations.

**Configuration.** Isolation is on by default; set `"sandboxWorkspaces": false` in `.janissary/config.json` to disable it (e.g. on a non-macOS host, or if it interferes with a particular harness). It also requires `sandbox-exec` to be present, which rules out non-macOS hosts. When a workspaced tab is created and isolation isn't actually active — the config key is off, or `sandbox-exec` is unavailable — a one-line notice is appended to the tab's transcript.

#### Known limitations

- **`~/Library/Keychains` is readable**, unlike the other secret paths above. Even "modern" Keychain Services calls fall through to a legacy implementation on macOS that reads the keychain database file directly rather than only talking to `securityd` over IPC — denying that read blocks every Keychain lookup a sandboxed process makes, including a harness's own OAuth credential, and it fails silently (the harness just reports "not logged in", with no permission error to explain why). The database itself stays encrypted and per-item ACL-enforced by `securityd` regardless of raw file readability, so this doesn't hand out plaintext secrets — but it is a materially larger read surface than the rest of the sandbox's design intends, kept as a deliberate trade-off.
- The sandbox confines **filesystem and network** access; it does not sandbox CPU, memory, or other system resources, and a sandboxed process can still make outbound network requests (unless `--offline` is set).
- macOS only — on other platforms, `-w` still creates the disposable git workspace, just without process confinement (a transcript notice says so).

### Dev-tooling security checks

See [Security Checks](#security-checks) under Development for the automated lint/secrets/dependency checks that run in this repo's own CI, and their threat model.

## Development

```bash
npm start
```

Run tests:

```bash
npm test
```

### Documentation

User-facing docs live in `public-documentation/`, a [VitePress](https://vitepress.dev) site (content conventions in `ai/guidelines/user-documentation.md`):

```bash
npm run docs:dev       # local dev server with live reload
npm run docs:build     # static build → public-documentation/.vitepress/dist/
npm run docs:preview   # serve the built site locally
```

The screenshots on the doc pages are generated, not hand-taken: a manifest (`scripts/docs-screenshots/manifest.mjs`) drives the real app against fixture data with Playwright and writes PNGs to `public-documentation/public/screenshots/`:

```bash
npm run build:web                      # captures show the built web UI — build it first
npm run playwright:install-chromium    # one-time, if Chromium isn't installed yet
./scripts/run.mjs docs-screenshots     # regenerate every shot (or pass specific shot names)
```

The script is host-only (sandboxed workspaces can't reach Playwright's browser cache). When a UI change alters what a screenshot shows, regenerate and commit the PNGs in the same PR — same rule as any other doc change. Shots that need a harness binary (e.g. `claude`) are skipped with a warning when it isn't on `PATH`.

### Testing

Run all tests (server + client):

```bash
npm test
```

Run tests for a specific project:

```bash
npm run test:server   # Node server tests (src/)
npm run test:client   # React web client tests (web/src/)
npm run test:watch    # watch mode — reruns on file changes
```

### Checking changes

Two commands verify code during development:

**During development** — run after each change for fast feedback:

```bash
npm run check:diff          # lint + typecheck affected projects + related tests (orchestrator)
npm run lint:diff           # lint changed files only
npm run typecheck:diff      # typecheck affected projects (incremental)
npm run test:diff:server    # server tests related to changes
npm run test:diff:web       # web tests related to changes
```

`npm run check:diff` runs the orchestrator, which automatically lints changed files, typechecks affected projects incrementally, and runs tests from the affected area(s):
- Server tests only if `src/` files changed
- Web tests only if `web/src/` files changed  
- Both if changes touch both areas

Completes in seconds. You can also run individual commands above if you want to focus on a specific check.

**At the end of work** — run once when all changes are complete:

```bash
npm run check        # full gate (humans only) — lint all, typecheck all, test all, plus complexity/duplication/dead code
```

This adds CSS linting, code complexity metrics, duplication detection, dead code scanning, the full test suite, and coverage thresholds. **Use `check:diff` dozens of times while working, but run `check` only once, at the very end.** AI developers should never run `check` — leave it for the human to verify before shipping.

### Code Coverage

Generate a merged HTML + LCOV + JSON coverage report:

```bash
npm run coverage
```

Output lands in `coverage/` (gitignored). Open `coverage/index.html` in a browser to browse the interactive report, which breaks down coverage by directory (`src/` vs `web/src/`).

Coverage is enforced with a **fixed 90% threshold** across all metrics (statements, branches, functions, lines) for both `src/**` (server) and `web/src/**` (client). If a change drops coverage below 90% in any metric for either area, the run fails. Thresholds are stored in `vitest.config.ts` and do not change automatically — the 90% floor is a hard requirement that applies equally to all code.

### Code Quality

Two tools measure code quality: **FTA** (complexity scores per file) and **ESLint sonarjs** (cognitive complexity per function, surfaced inline during lint).

#### Running the report

```bash
npm run quality        # ranked complexity table for src/ and web/src/
npm run quality:gate   # same, but exits non-zero if any file exceeds the score cap
```

Both commands print a score-sorted table for each area:

```
┌──────────────────┬────────────┬─────────────────────┬────────────────────┐
│ File             │ Line count │ FTA score           │ Assessment         │
├──────────────────┼────────────┼─────────────────────┼────────────────────┤
│ controller.ts    │ 815        │ 94.30               │ Needs improvement  │
│ tab.ts           │ 200        │ 60.26               │ Needs improvement  │
│ schedule.ts      │ 183        │ 59.59               │ Could be better    │
└──────────────────┴────────────┴─────────────────────┴────────────────────┘
```

#### Reading the FTA score

| Score | Assessment | Meaning |
| ----- | ---------- | ------- |
| < 50 | OK | Low risk; leave it alone unless you're already in the file. |
| 50–75 | Could be better | Worth decomposing when you next touch it. |
| 75–95 | Needs improvement | Active refactoring target; add tests before changing. |
| > 95 | _(blocked)_ | Exceeds the regression gate — the score cap in `fta.json` prevents scores this high from landing. |

The score combines cyclomatic complexity, Halstead volume, and line count. A high score means the file is both large and branchy — the highest-leverage refactoring targets. `controller.ts` (94.3) is the current outlier; see `fta/` for the full per-file baseline.

#### Regression gate

`fta.json` sets `score_cap: 95`. `npm run quality:gate` exits non-zero if any file's score exceeds it, blocking regressions in CI. Ratchet the cap **down** as high-scoring files are decomposed — the mirror of the coverage threshold ratchet.

#### Complexity warnings in lint

`npm run lint` also reports **cognitive complexity** per function via `eslint-plugin-sonarjs`. Functions above 15 get a `warning` with an exact line number:

```
src/controller.ts
  706:11  warning  Refactor this function to reduce its Cognitive Complexity
                   from 30 to the 15 allowed  sonarjs/cognitive-complexity
```

These are warnings, not errors — they surface during normal development without blocking CI. Resolve them by extracting the flagged function into smaller helpers.

#### Refreshing the baseline

After intentional complexity work, commit an updated snapshot:

```bash
npm run quality:snapshot
```

This rewrites `fta/baseline-server.json` and `fta/baseline-client.json`, which track the per-file trend over time.

### Code Duplication

Detect copy-pasted code blocks across `src/` and `web/src/` with [jscpd](https://github.com/kucherenko/jscpd). Test files are excluded so the metric reflects production duplication only.

```bash
npm run duplication        # print all clones and the overall duplication %
npm run duplication:gate   # same, but exits non-zero if duplication exceeds the threshold
```

#### Reading the output

Each clone block names the two file locations that match:

```
Clone found (typescript)
 - commands/state.ts [11:64 - 34:58]
   state-format.ts [4:57 - 24:115]
```

The summary table at the end shows the total picture:

```
┌────────────┬────────────────┬─────────────┬──────────────┬──────────────┬──────────────────┐
│ Format     │ Files analyzed │ Total lines │ Total tokens │ Clones found │ Duplicated lines  │
├────────────┼────────────────┼─────────────┼──────────────┼──────────────┼──────────────────┤
│ typescript │ 64             │ 5469        │ 42226        │ 12           │ 152 (2.78%)       │
└────────────┴────────────────┴─────────────┴──────────────┴──────────────┴──────────────────┘
```

The **Duplicated lines %** is the key number. Under 3% is acceptable for this codebase; the gate enforces that ceiling.

#### Regression gate

`.jscpd.json` sets `threshold: 3`. `npm run duplication:gate` exits non-zero if the duplication percentage exceeds it, blocking regressions in CI. Ratchet the threshold **down** toward 2% as clones are removed.

Configuration lives in `.jscpd.json`. The minimum clone size is 5 lines / 50 tokens — shorter matches are noise, not duplication.

### CSS Linting

Lint `web/src/theme.css` for correctness with [stylelint](https://stylelint.io) + `stylelint-config-standard`. Prettier already handles formatting; stylelint covers correctness conventions (modern color notation, deprecated property values, etc.).

```bash
npm run lint:css        # check for issues — exits non-zero if any are found
npm run lint:css:fix    # auto-fix what stylelint can fix, then review the diff
```

Configuration lives in `web/.stylelintrc.json`. Purely formatting rules (`declaration-block-single-line-max-declarations`, `*-empty-line-before`) are disabled because the stylesheet uses a deliberate compact single-line style that Prettier preserves.

### Dead Code

Detect unused exports, files, types, and dependencies with [Knip](https://knip.dev). A single scan covers both `src/` and `web/src/`.

```bash
npm run knip        # full scan — exits non-zero if any dead code is found
npm run knip:fix    # auto-remove unused exports, files, and dependencies, then review the diff
```

#### Reading the output

Knip groups findings by category:

```
Unused dependencies (1)
some-package   package.json

Unused files (1)
src/old-feature.ts

Unused exports (3)
helperFn   function   src/utils.ts:12:17
CONSTANT              src/config.ts:5:14

Unused exported types (2)
OldType   type   src/types.ts:42:13
```

Work the categories safest-first: **unused dependencies** → **unused files** → **unused exports/types**.

#### Regression gate

`npm run knip` exits non-zero on any finding. Run it alongside `npm run lint` and `npm run test` to prevent dead code from accumulating. Configuration lives in `knip.json`; suppression (`ignoreDependencies`, `ignoreBinaries`) is the rare exception and each entry has a justifying comment.

### Security Checks

Three automated checks run in `npm run security`: security-focused lint rules, secrets scanning, and dependency CVE auditing. The checks are wired into a **pre-push git hook** so they run automatically before every push.

```bash
npm run security          # lint + secrets + deps (pre-push gate)
npm run security:deps     # npm audit --omit=dev (dependency CVEs)
npm run security:secrets  # gitleaks scan (requires gitleaks: brew install gitleaks)
npm run security:sast     # Opengrep one-time audit → security-audit.sarif (on demand)
```

#### Security lint

`eslint-plugin-security` adds three targeted rules to the existing `npm run lint`:

| Rule | Severity | What it catches |
| ---- | -------- | --------------- |
| `detect-unsafe-regex` | error | Regexes with catastrophic backtracking potential (ReDoS) |
| `detect-eval-with-expression` | error | `eval()` called with a non-literal expression |
| `detect-non-literal-fs-filename` | warning | `fs.*` calls with dynamic (variable) paths — review each hit |

`detect-child-process` is intentionally off: the app's shell/git/glob exec on local-user input is the product, not a vulnerability.

#### Secrets scanning

[gitleaks](https://github.com/gitleaks/gitleaks) scans the working tree and git history for committed credentials. Install it separately (it is a standalone binary — not an npm package):

```bash
brew install gitleaks    # macOS
# or: https://github.com/gitleaks/gitleaks/releases
```

The **pre-commit hook** calls `gitleaks protect --staged` to block newly staged secrets before they land in history. The **pre-push hook** re-runs the full tree scan via `npm run security`.

#### Dependency CVE audit

`npm run security:deps` runs `npm audit --omit=dev` against the lock file. No extra tooling — uses npm's built-in auditing.

#### SAST (on demand)

`npm run security:sast` runs [Opengrep](https://github.com/opengrep/opengrep) (must be installed separately) across `src/` and `web/src/` and writes a SARIF report to `security-audit.sarif`. This is a broad, one-time audit with expected false positives — review the output by hand rather than gating CI on it.

#### Threat model

Severity is driven by trust boundaries, not by how scary the sink looks:

| Source | Trust | Implication |
| ------ | ----- | ----------- |
| Local user typing in their terminal | **Trusted** | Shell/SQL/git exec on user input is the product. |
| ACP agent output rendered in the web client | **Untrusted** | Agent-controlled markdown/HTML; sanitized by DOMPurify. |
| Agent/tab names flowing into file paths | **Semi-trusted** | Validated against `/^[\w-]+$/` before any `path.join`. |
| Anything reachable over the bound port | **Untrusted** | Mitigated by loopback allow-list + session token + CSP headers. |

The ACP tool loop is sandboxed to `db` and `browser` commands — agents cannot invoke shell, `open`, or git clone.

#### Inline suppression

When a lint finding is intentional, suppress it inline with a reason co-located with the code (not in a separate file):

```ts
// Intentional: user-driven shell glob; only the local user reaches this sink.
// eslint-disable-next-line security/detect-child-process
const res = spawnSync(SHELL_NAME, ['-c', expr], { cwd, encoding: 'utf8' });
```

### Linting

```bash
npm run lint          # ESLint over the entire tree
npm run lint:files    # ESLint over only the files you care about
```

`npm run lint:files` defaults to every **uncommitted** file (staged, unstaged, and new
untracked files), so you can check just your changes without waiting on a full-tree lint:

```bash
npm run lint:files                          # all uncommitted files
npm run lint:files -- src/foo.ts web/src/App.tsx   # only the named files
npm run lint:files -- --fix                 # autofix the uncommitted set
npm run lint:files -- --fix src/foo.ts      # autofix specific files
```

Arguments after `--` that start with `-` are passed straight to ESLint; everything else is
treated as a path. Non-lintable paths (`.md`, `.json`, directories) are filtered out
automatically. The script lives at `scripts/lint-files.mjs`.

### Commit conventions

All commit messages and PR titles must follow the [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) specification, detailed in [`ai/guidelines/conventional-commits.md`](ai/guidelines/conventional-commits.md). The format is:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

Valid types: `feat`, `fix`, `build`, `chore`, `ci`, `docs`, `style`, `refactor`, `perf`, `test`, `revert`. Breaking changes are indicated with a `!` after the type/scope or a `BREAKING CHANGE:` footer.

