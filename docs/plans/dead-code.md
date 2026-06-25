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

**Knip** is the right tool — dedicated to dead-code detection, understands TypeScript, has first-class plugins for the frameworks this repo already uses (Vite, Vitest, ESLint, TypeScript), and produces machine-readable output.

| Factor | Knip | ts-prune | ts-unused-exports | depcheck |
|---|---|---|---|---|
| Unused exports | ✅ | ✅ | ✅ | ❌ |
| Unused files | ✅ | ❌ | ❌ | ❌ |
| Unused dependencies | ✅ | ❌ | ❌ | ✅ |
| Unused types | ✅ | ❌ | ❌ | ❌ |
| Duplicate exports | ✅ | ❌ | ❌ | ❌ |
| Auto-fix (`--fix`) | ✅ | ❌ | ❌ | ❌ |
| Framework plugins | ✅ | ❌ | ❌ | ❌ |
| License | MIT | MIT | MIT | MIT |

Knip is the only tool that covers all five categories, and the only one that can auto-remove findings.

> **Design principle for this plan: configure as little as possible.** Knip is built to auto-detect entry points and dependency usage from `package.json`, the `bin` field, npm scripts, and framework config (`vite.config.ts`, `vitest.config.ts`, `eslint.config.mjs`). Every manual `entry`, `ignore`, or `ignoreDependencies` line we add is a place a real finding can be hidden. We add config **only** to fix a proven false positive, and we leave a comment saying why. The goal is to drive findings to zero, not to silence them.

---

## Repo facts this plan is built on

Verified against the tree (not assumed):

- **Single npm package.** There is no `web/package.json` — `web/` is not a separate workspace, it shares the root `package.json`. It does have its own `web/tsconfig.json` (bundler/DOM) distinct from the root `tsconfig.json` (NodeNext/server).
- **Published entry is `bin/janus.mjs`** (`package.json` → `bin.janus`). It launches `dist/main.js` or `src/main.ts` by **spawning a path string**, not by importing it — so Knip cannot trace `src/main.ts` from the bin file. The `start`/`dev` scripts (`tsx src/main.ts`) do let Knip's script parser find it, but we list `src/main.ts` explicitly so it never silently becomes "unreachable."
- **Web entry is auto-detected.** Knip's Vite plugin reads `web/vite.config.ts` → `web/index.html` → `web/src/main.tsx`. No manual web entry needed.
- **Registries are statically imported, not dynamic.** `src/commands/index.ts` and `src/openers/index.ts` import every member with normal `import` statements and re-export an array. `openerForExtension()` is a plain `Array.find` over that static list — there is **no** `import()` or filesystem-driven loading. So these files are reached through the normal import graph and must **not** be listed as entry points (listing them would mask any genuinely-dead command/opener).
- **`ink` is already dead.** `ink` (a `dependencies` entry) is imported in **zero** files; `ink-testing-library` is imported in exactly one test (`src/messaging.hook.test.tsx`). This is a real, removable finding — see Phase 4. The previous draft of this plan ignored both, which would have hidden it.

---

## Phase 1 — Install

```bash
npm install --save-dev knip
```

---

## Phase 2 — Minimal config

Create `knip.json` at the repo root. Start with the smallest config that names the one entry Knip can't infer (`src/main.ts`, reached only via a spawned path string) and lets every plugin do the rest:

```jsonc
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "entry": ["src/main.ts"],
  "project": ["src/**/*.{ts,tsx}", "web/src/**/*.{ts,tsx}"]
}
```

That's the whole starting config. Notably **absent**, and why:

| Not included | Why |
|---|---|
| `web/src/main.tsx` entry | Auto-detected by Knip's Vite plugin via `web/index.html`. |
| `src/commands/index.ts`, `src/openers/index.ts` entries | Reached through static imports; listing them as entries would hide dead members. |
| `ignore: [**/*.test.*]` | **Do not ignore tests.** Knip's Vitest plugin treats test files as entry points. Keeping them in scope means (a) an export used only by a test is correctly counted as used instead of false-flagged, and (b) genuinely-unused test helpers get reported. Ignoring tests breaks both. |
| `ignoreDependencies` for react/react-dom/dompurify/marked/xterm/ink | Knip's Vite + React plugins resolve JSX/runtime deps; the rest are real imports. `ink` is genuinely unused and **should be removed, not ignored** (Phase 4). Add an `ignoreDependencies` entry only after confirming a specific false positive, with a comment. |
| `ignoreBinaries` for tsx/vite/eslint/prettier | Recognized from `package.json` scripts and config files by Knip's plugins. |
| `compilers: { tsx: "tsx" }` | **Incorrect.** `compilers` maps non-standard *file extensions* (`.vue`, `.svelte`, `.mdx`) to transform functions. `.ts`/`.tsx` are native to Knip; this block does nothing useful and was a confusion between the `tsx` runtime and the `.tsx` extension. |

### If the first run shows false positives

Add config **only** to address a confirmed false positive, each with a justifying comment. Likely candidates and the *correct* fix:

```jsonc
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "entry": ["src/main.ts"],
  "project": ["src/**/*.{ts,tsx}", "web/src/**/*.{ts,tsx}"],

  // Count a same-file-only export as used (common for co-located helpers tested in-file).
  "ignoreExportsUsedInFile": true,

  // Example — only if a run proves these are framework-resolved, not source imports:
  // "ignoreDependencies": ["some-eslint-plugin-resolved-by-name"]
}
```

If server and client ever need genuinely different entry/ignore rules, prefer Knip **workspaces** (keyed by directory) over a second config file — but for one package, a single config and a single run is the intended setup.

---

## Phase 3 — Run

```bash
# Human-readable, grouped by category (default `symbols` reporter)
npx knip

# One line per finding — good for skimming a large first run
npx knip --reporter compact

# Machine-readable, for CI or scripting (prints to stdout; do not commit by default)
npx knip --reporter json
```

A single run covers both `src/` and `web/`. There is no separate client run — the previous "single tsconfig" rationale was inaccurate; Knip resolves each area against its own `tsconfig.json` automatically.

Add scripts to `package.json`:

```json
{
  "scripts": {
    "knip": "knip",
    "knip:fix": "knip --fix"
  }
}
```

| Command | What it does |
|---|---|
| `npm run knip` | Full scan, grouped output, **non-zero exit on findings** (so it gates in CI). |
| `npm run knip:fix` | Auto-removes unused exports, unused files, and unused `package.json` deps, then leave the diff for review. Scope it with `--fix-type exports,files,dependencies` if you want to apply categories one at a time. |

---

## Phase 4 — Triage & remove

Knip already orders output by category, so no custom ranking script is needed. Work the categories in this order — safest and highest-signal first:

1. **Unused dependencies** — remove from `package.json`, re-run `npm install`. Confirmed starting point: **`ink`** (imported nowhere) and, once `src/messaging.hook.test.tsx` is accounted for, decide whether **`ink-testing-library`** (one test) is worth keeping. These are the kind of finding the plan exists to surface — don't suppress them.
2. **Unused files** — a file no entry reaches. Confirm with a quick `grep` for the basename, then delete. Lowest risk: nothing imports it.
3. **Unused exports / types** — drop the `export` keyword (keep the symbol if used in-file) or delete it. If an export is an intentional public surface, annotate it with a JSDoc `@public` tag so Knip stops reporting it, or list it under config `ignore` — **do not** invent directives (`// knipignore`, `@knipignore`, and a `knipIgnore` config field are not real Knip features).
4. **Duplicate exports** — the same symbol re-exported from two paths. Consolidate to one and update importers.

For most of categories 1–3, `npm run knip:fix` does the mechanical removal; always review the resulting diff and run the test suite before committing.

### Suppression — the real mechanisms

| Situation | Correct mechanism |
|---|---|
| Export used only within its own file | `"ignoreExportsUsedInFile": true` in config |
| Export is an intentional public API | JSDoc `@public` tag on the declaration, or add to config `ignore` |
| Dependency resolved by a tool, not imported in source | Add the specific package to `ignoreDependencies` **with a comment** |
| Binary run via a script Knip can't parse | Add to `ignoreBinaries` with a comment |

There is no per-line ignore comment; suppression is configuration- or JSDoc-tag-based and should be the rare exception, each justified in place.

---

## Phase 5 — Gate against regressions

Once findings are at zero, keep them there by running Knip in the same place ESLint runs:

- **Locally:** `npm run knip` (already exits non-zero on any finding).
- **CI / pre-push:** add `npm run knip` alongside `npm run lint` and `npm run test`. New dead code fails the check.

A committed `baseline.json` diff workflow is intentionally **not** part of this plan. Knip auto-configures well enough here to reach zero quickly, and a "fix to zero, then gate" loop is simpler and stricter than maintaining a baseline snapshot. Only introduce a baseline if a first run surfaces more debt than can be cleared in one pass — and treat it as temporary, with a tracked goal of deleting it.

---

## Directory layout (after this plan)

```
knip.json          # single root config — minimal, comments justify any suppression
package.json       # adds "knip" and "knip:fix" scripts; loses unused deps (ink, …)
```

No `knip.client.json`, no `docs/dead-code/` report directory, and no `scripts/dead-code-report.ts`. Knip's built-in reporters and `--fix` replace the homegrown JSON pipeline and ranking script the previous draft proposed.

---

## Summary

| Category | What Knip reports | Action |
|---|---|---|
| Unused dependencies | `package.json` entry no code imports | Remove from `package.json` (start: `ink`) |
| Unused files | File no entry point reaches | Delete (verify with a grep first) |
| Unused exports / types | Exported symbol/type with zero references | Drop `export` or delete; `@public` if intentional API |
| Duplicate exports | Same symbol exported from multiple paths | Consolidate to one path |

Run `npm run knip` to scan the whole repo in one pass; `npm run knip:fix` to auto-remove and review the diff.
