# Improve Security (detect everything, fix only the safe case, report the rest)

Your job: run the security tools, list **every** finding, automatically apply the **one** kind of fix that is safe and mechanical (a dependency patch), and **report all other findings for a human** — do not change that code yourself.

**Shell hygiene:** run every command on its own line — no `&&` chaining, no `; echo "Exit code: $?"` suffixes, no subshell captures. The exit code and output are visible in the tool result. To run a project script, always use `./scripts/run.mjs <name>` — never call `node scripts/<name>.mjs` directly.

**Why security is different from other cleanups:** a wrong security "fix" still passes the tests. If you silence a warning, weaken a check, or delete a guard, `tsc`, the linter, and the tests all stay green — so they **cannot** tell you that you made the code less safe. Because nothing will catch a bad call, you must not make security judgment calls. Detect and report; let a human decide.

Do the steps below **in order**. Do not skip steps. Do not invent your own process.

## The one safety rule (read this first)

### Safe to do on your own — the ONLY change you may make

- **Apply dependency patches** with `npm audit fix` (this fixes known CVEs using compatible versions). Then verify the project is still green. That is the only fix you apply on your own.

### Never do on your own — REPORT it, do not touch the code

Leave every one of these to a human. List it in your report (Step 3); do **not** edit the code:

- Add or change **input validation / sanitisation**.
- Add an `eslint-disable` comment, or **silence / suppress** any security finding in any way.
- Rewrite a **regex**, remove an **`eval`**, or change any **auth / crypto / token** code or `src/security.ts`.
- **Remove a committed secret** or rewrite git history.
- Run **`npm audit fix --force`** (it makes breaking changes).

Each of those is a judgment call, and a wrong call hides a real problem that the tests will not catch. Never edit config files or test files by hand. (`npm audit fix` may edit `package.json` / `package-lock.json` — that is fine.)

---

## Step 0 — Prepare the workspace

Execute `ai/prepare-workspace.md` in full before doing anything else.

---

## Step 1 — Run the security tools and list every finding

Detection is always safe, so do it even if the project is not green right now.

### 1a — ESLint security findings

```bash
npm run lint 2>&1
```

ESLint groups findings under each file: the **file path is printed on its own line**, and its findings are **indented below it**, like this:

```
/Users/you/janissary/src/agent-state.ts
  33:8   warning  Found existsSync from package "node:fs" with non literal argument at index 0  security/detect-non-literal-fs-filename
```

A security finding is any indented line whose last column is a rule starting with **`security/`**. For each one, record: the **file** (the path line above it), the **line:column** (e.g. `33:8`), the **severity** (`error` or `warning`), and the **rule**. (Quick filter: `npm run lint 2>&1 | grep -E "security/|^/"` keeps the security lines and the file-path headers.)

### 1b — Dependency CVEs

```bash
npm run security:deps 2>&1
```

If it lists vulnerabilities, record for each: the **package**, the **CVE/advisory**, the **severity** (`low`/`moderate`/`high`/`critical`), and whether a **fix is available**. If it says `found 0 vulnerabilities`, record "No dependency CVEs."

### 1c — Secrets scan

```bash
npm run security:secrets 2>&1
```

If the output says the command is not found / not installed, record "Secrets not scanned (gitleaks not installed)" and move on — this is **not** a failure. Otherwise record every finding (file, line, what was detected).

**If all three are clean, report "No security findings." and stop.** Otherwise continue.

---

## Step 2 — Apply the one safe fix: dependency patches (only if there are any)

Do this step **only if Step 1b found a vulnerability with a fix available.** If there were no dependency CVEs, skip straight to Step 3.

1. **Confirm the project is green first** (you are about to change code):
   ```bash
   npx tsc --noEmit 2>&1
   npm test 2>&1
   npm run lint 2>&1
   ```
   The compiler must have no errors, every test must pass, and lint must have no errors (warnings are fine). **If it is not green, do not fix anything** — report the CVE in Step 3 with the note "not auto-fixed: project was not green," and stop.

2. **Back up the manifest and lock file:**
   ```bash
   cp package.json package.json.bak
   cp package-lock.json package-lock.json.bak
   ```

3. **Apply the fix** (never use `--force`):
   ```bash
   npm audit fix
   ```

4. **Verify** — everything must be green and the CVE gone:
   ```bash
   npx tsc --noEmit 2>&1
   npm test 2>&1
   npm run lint 2>&1
   npm run security:deps 2>&1
   ```
   If anything is no longer green, **restore the backups and report**:
   ```bash
   cp package.json.bak package.json && cp package-lock.json.bak package-lock.json && npm install
   ```
   If `npm audit` says the remaining vulnerabilities can only be fixed with `--force` (breaking changes), do **not** force them — list them in Step 3 for a human.

When green, delete the backups: `rm package.json.bak package-lock.json.bak`.

---

## Step 3 — Report

Give the user a short report in this exact shape. Group the ESLint findings by rule so the list stays short.

```
Fixed automatically:
  Dependencies:  <packages patched + new versions, or "none">

Needs a human — NOT auto-fixed:
  ESLint security:
    <rule>  (<error/warning>)  ×<count>  in: <file:line, file:line, ...>
      → <one-line suggestion, e.g. "confirm each path is trusted, or add validation at the entry point">
    ... (one block per rule)
  Secrets:        <findings, or "none", or "not scanned — gitleaks not installed">
  Dependency CVEs not fixed: <CVEs needing --force or with no fix, or "none">

Scans skipped:    <e.g. "gitleaks not installed", "opengrep not installed", or "none">
Verify (only if a fix was applied): compiler / tests / lint all green
```

For a deeper scan, a human can run `npm run security:sast` (requires opengrep). Keep the report brief. Done.
