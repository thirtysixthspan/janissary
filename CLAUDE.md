# Development Guide for Claude Code

## Guidelines

Before starting work, read every file in [`ai/guidelines/`](ai/guidelines/) — it holds the project's architecture principles, code guidelines, plugin architecture guidance, PR automation, and writing/summary conventions. Treat all of it as binding.

## ESLint rules

Before writing code, review [`eslint.config.mjs`](eslint.config.mjs) to understand the linting rules that apply. Write code on the first pass that conforms to these rules to avoid rework:

- **Type-aware rules** (`src/**/*.ts`, `src/**/*.tsx`, `web/src/**/*.ts`, `web/src/**/*.tsx`): `@typescript-eslint/prefer-nullish-coalescing`, `@typescript-eslint/no-unnecessary-type-assertion`, `@typescript-eslint/no-unsafe-assignment`, `@typescript-eslint/no-unsafe-member-access`
- **Security rules** (`src/` and `web/src/`): `security/detect-unsafe-regex`, `security/detect-eval-with-expression`
- **Code complexity** (`src/` and `web/src/`): `sonarjs/cognitive-complexity` (warn, limit ~15), `sonarjs/no-duplicate-string` (warn)
- **File size limit**: `max-lines` max 200 lines (skipping blanks/comments) — extract into new modules rather than compacting code
- **Import extensions** (`src/`): NodeNext style — relative imports must carry `.js` (and `.json`), never `.ts`/`.tsx`

## Verifying changes

### ✅ AI workflow — use these commands while developing

**Always use the fast diff-scoped commands** after each change:

```bash
./scripts/run.mjs lint-files   # lint changed files
npm run typecheck:diff        # typecheck affected projects (incremental)
npm run test:diff:server      # server tests for changes
npm run test:diff:web         # web tests for changes
./scripts/run.mjs check-diff   # orchestrator: runs all four above concurrently
```

Pick the one(s) you want, or just run **`./scripts/run.mjs check-diff`** which automatically:

- Lints only the files you changed
- Typechecks the affected project(s) incrementally (fast on repeated runs)
- Tests related tests from the affected area(s):
  - Server tests if `src/` files changed
  - Web tests if `web/src/` files changed
  - Both if changes touch both areas

This completes in seconds and is the entire development loop. `check-diff` is scoped to the uncommitted working tree; committing or reverting mid-task rescopes it automatically.

### ❌ `npm run check` — HUMANS ONLY

**Do NOT run `npm run check` while developing.** This is the end-of-work gate meant only for humans or CI:

- Slow: lints all files, typechecks both full projects, runs the entire test suite
- Coverage thresholds enforced
- Also adds CSS linting, code complexity checks, duplication detection, dead code scanning

**Leave it for the human to run exactly once, after all work is complete.** If you run it while iterating, it wastes time and blocks the human's workflow.

## Summary

| Command | When | Who | Speed |
| --- | --- | --- | --- |
| `./scripts/run.mjs check-diff` | After each change | AI (always) | ~10-40s |
| `npm run check` | Once, end of work | Human only | ~2min |

## Capturing command output

**Never re-run a slow command multiple times to filter its output differently.** Capture once, filter as needed — and don't use shell variable capture (`output=$(...)`) to do it: that syntax can't be statically matched against the Bash allowlist and triggers a permission prompt on the very first call.

Instead, write the captured output to a file under `./temp/` using the **Write tool** (not a shell redirect), then filter that file with plain, redirect-free Bash commands — each one matches an allowlisted prefix (`grep *`, `tail *`, `cat *`, ...) and stays prompt-free:

```bash
# ❌ Antipattern — runs npm 3 times
npm run lint 2>&1 | grep "sonarjs"
npm run lint 2>&1 | grep "buffer.ts"
npm run lint 2>&1 | tail -3
```

```
✅ Correct
1. Run `npm run lint 2>&1` once via Bash, read its output from the tool result.
2. Use the Write tool to save that output to ./temp/lint.txt.
3. Filter it as many times as needed, each its own plain Bash call:
   grep "sonarjs" ./temp/lint.txt
   grep "buffer.ts" ./temp/lint.txt
   tail -3 ./temp/lint.txt
4. rm ./temp/lint.txt when done.
```

This applies to any slow command: lint, typecheck, test runs, builds.

## Avoid unnecessary file redirects in Bash calls

When a command's output just needs to be read or passed to the next step, do not redirect it to a file with `>`/`>>` and then `cat` it back in a separate call. The Bash tool already returns stdout/stderr directly in the tool result — reading a redirected file is redundant, and in permission-gated environments a redirect is a distinct file-write capability that isn't covered by an allowlisted command prefix, so it can trigger an approval prompt even when the command itself is pre-approved.

Instead:

- Just run the command and read its output from the tool result.
- If a later step needs the value, re-derive it (re-run the read-only command again) rather than stashing it in a file — shell variables don't persist across separate Bash calls anyway.
- Only write output to a file when a downstream command genuinely requires a file path as input (e.g. a script argument that must be a file, not stdin), or when you need to filter one slow command's output multiple ways (see [Capturing command output](#capturing-command-output)) — and prefer the Write tool for that, not a shell redirect.
- This applies to project workflow docs (`ai/**/*.md`, `product/specs/*.md`, `product/plans/**/*.md`) too: if an example command shows `> file` followed by `cat file`, treat that as a mistake to fix, not a pattern to replicate.

```bash
# ❌ Antipattern — redirect triggers a permission prompt even though `npm run coverage` alone is pre-approved
mkdir -p ./temp && npm run coverage > ./temp/coverage.txt 2>&1; echo done
```

```bash
# ✅ Correct — no redirect; read the result straight from the tool call
npm run coverage 2>&1
```

## Package updates

**Never run `npm install` or `npm update` on a package without checking it against the supply-chain blocklist first.** The list lives in [`security/known-malicious-packages.json`](security/known-malicious-packages.json) and is enforced by:

```bash
./scripts/run.mjs check-malicious-package <pkg>@<version> ...   # gate install targets
./scripts/run.mjs check-malicious-package --audit               # scan package-lock.json
```

Exit codes: `0` clean, `2` BLOCKED (an exact known-malicious release), `3` QUARANTINED (a package or scope from a compromised maintainer account, at a version not yet known to be bad), `1` the check itself failed. **Only `0` permits an install** — a failed check is never permission to proceed. Treat `3` as seriously as `2`: these campaigns spread by publishing fresh version bumps, so "not yet on the list" is not the same as safe.

Every package-update playbook in `ai/tasks/` runs this gate before touching `node_modules/`. When a new incident is disclosed, add a campaign object to the JSON rather than editing the script.

## Plan and task formatting

When writing implementation plans or creating tasks, use natural line breaks only — do not artificially wrap lines at a fixed column width. Let long lines flow naturally so content remains readable in any viewport.

## Plan storage

Implementation plans live in `product/plans/`, organized into folders by status. Each plan is a single markdown file; move the file between folders as its status changes:

- `product/plans/draft/` — the plan itself is still being drafted and refined
- `product/plans/ready/` — the plan is finalized and ready to implement
- `product/plans/complete/` — the plan has been implemented
- `product/plans/deferred/` — intentionally put on hold; not planned for near-term work

Backlogs of smaller items live in `product/backlog/`: `bugs.md`, `chores.md`, `features.md`, and `issues.md`.

## Code guidelines

Follow the conventions in [`ai/guidelines/code-guidelines.md`](ai/guidelines/code-guidelines.md), including the
file-size limit and how to respond to it (extract code into a new module — never compact
code, strip comments, or delete spacing to get under the limit).

## React code organization

When adding or restructuring anything in `web/src/`, follow
[`ai/guidelines/react-code-organization.md`](ai/guidelines/react-code-organization.md). It covers
feature-based directories over type-named buckets, colocation and when to promote to shared, the
one-way `shared → feature → app` dependency flow with no cross-feature imports, and the
pure module / service / hook / component layering that keeps components thin and logic testable
without a render.

## Plugin architecture

When designing or building anything loaded at runtime through a published contract, follow
[`ai/guidelines/plugins.md`](ai/guidelines/plugins.md). It sets the design criteria for extension
points and plugins — capability-narrow contexts, registry over conditionals, static declaration with
lazy activation, API versioning and deprecation windows, failure isolation, performance budgets, and
the server/client integration points.

## Commits and pull requests

All commit messages and PR titles must follow the [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) specification, detailed in [`ai/guidelines/conventional-commits.md`](ai/guidelines/conventional-commits.md). The format is:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

Valid types include `feat`, `fix`, `build`, `chore`, `ci`, `docs`, `style`, `refactor`, `perf`, `test`, and `revert`. Breaking changes are indicated with a `!` after the type/scope or a `BREAKING CHANGE:` footer.

## Running scripts

Use `./scripts/run.mjs <name>` to run any script in `scripts/`. This is the only way to invoke scripts — it is pre-approved in `.claude/settings.json` so no permission prompt is needed.

```bash
./scripts/run.mjs pr-merge-to-master   # runs scripts/pr-merge-to-master.sh
./scripts/run.mjs check-diff           # runs scripts/check-diff.mjs
./scripts/run.mjs                      # lists all available scripts
```

All scripts in `scripts/` are considered trusted. Do not invoke them directly with `bash scripts/foo.sh` or `node scripts/foo.mjs` — use the runner so the single permission covers everything.

## Project structure

- `src/` — Server (Node.js, CLI, terminal UI); tests colocated as `src/**/*.test.ts` (vitest project `server`)
- `src/plugins/` — Bundled tab-plugin manifests, shared contracts, lazy server activations, and host infrastructure
- `web/src/` — Web UI (React, Vite); tests colocated as `web/src/**/*.test.ts(x)` (vitest project `client`)
- `web/src/plugins/` — Lazy client entries and React bodies for bundled tab plugins
- `bin/janus.mjs` — CLI entry point (`janus`)
- `product/` — plans, specs, and backlogs for product work (see below)
- `product/specs/` — functional specs, one file per feature; when a change alters behavior, update the matching spec
- `product/plans/` — implementation plans by status (see [Plan storage](#plan-storage))
- `product/backlog/` — backlogs of smaller items (`bugs.md`, `chores.md`, `features.md`, `issues.md`)
- `ai/` — agent workflow playbooks (`ai/tasks/**/*.md`), binding guidelines (`ai/guidelines/`), and personas (`ai/personas/`)
- `documentation/` — docs site (VitePress; `npm run docs:dev` / `docs:build`), with `documentation/user-documentation/` (user-facing) and `documentation/developer-documentation/` (contributor-facing) sections
- `scripts/` — project scripts; invoke only via `./scripts/run.mjs` (see [Running scripts](#running-scripts))
- `profiles/` — harness profiles (see `product/specs/profiles.md`)
- `skills/` — project-provided agent skills
- `security/` — `known-malicious-packages.json`, the supply-chain blocklist (see [Package updates](#package-updates))
- `fta/` — FTA code-quality baselines (regenerate with `npm run quality:snapshot`)
- `temp/` — scratch space for captured command output; gitignored
