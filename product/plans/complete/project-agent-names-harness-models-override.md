# Project overrides for agent-names.json and harness-models.json

**Complexity: 5/10** — no new architecture, but touches two independent static-import call sites (agent name pool, harness model catalog), their shared startup wiring in `main.ts`, and user documentation. Mirrors an existing, working pattern (`config.ts`'s `.janissary/config.json` load-with-fallback) closely enough that the risk is mechanical, not conceptual.

## Goal

Today `agent-names.json` and `harness-models.json` are loaded once, at build/module-resolution
time, via static `with { type: 'json' }` imports of the files bundled in the package root. A
project has no way to add its own agent names or extend/replace a harness's known model catalog
without editing the installed package.

After this change, a project can drop `.janissary/agent-names.json` (a JSON array of strings) and/or
`.janissary/harness-models.json` (a JSON object of `harness name -> model id[]`) into its own
`.janissary/` directory. When present and valid, each file **entirely replaces** the corresponding
bundled default for the rest of that run — the same override contract `.janissary/config.json`
already has with its bundled defaults (whole-document override, not a deep merge). Absent or invalid
project files fall back to the bundled catalogs, silently for "absent," with a stderr warning for
"invalid," matching `loadConfig`'s existing behavior.

## Approach

Follow `src/config.ts`'s exact shape: a runtime loader function that reads
`.janissary/<name>.json` from the project directory into module-level state, called once at startup
(`src/main.ts`, alongside the existing `loadConfig(cwd)` call), falling back to the bundled JSON
import on missing/invalid file. Existing consumers keep reading from the same names/functions they
already use — only the *source* of that state changes from "resolved at import time" to "resolved at
startup, from the project directory first."

- **`harness-models.json`** — `src/harness/models.ts` already centralizes every read behind
  `modelsFor`/`isKnownModel`, backed by one module-level `models` binding. Only that module changes;
  every caller (`completion/handlers.ts`, `harness/manager.ts`, `profile/agent-opener.ts`) is
  untouched.
- **`agent-names.json`** — currently has two independent static imports (`src/commands.ts:62`
  re-export, `src/agent/commands.ts:2` direct import) instead of one shared module. Introduce a new
  `src/agent-names.ts` (parallel to `src/config.ts`) as the single source of truth, holding a
  live-binding `export let agentNames` reassigned by `loadAgentNames`. Both existing call sites
  switch to importing from it instead of the raw JSON file, so their `agentNames.filter(...)` /
  `agentNames.toContain(...)` usage is unchanged.

## Reuse map

| Piece | Where | What it already does |
|---|---|---|
| Load-with-fallback pattern to mirror | `src/config.ts:30` (`loadConfig`) | Reads `.janissary/config.json`, falls back to defaults on missing/invalid, warns on stderr for invalid |
| Startup call site | `src/main.ts:157` (`loadConfig(cwd)`) | Where the new loaders get called, same `cwd` |
| Harness model catalog (single existing module) | `src/harness/models.ts` | `modelsFor` / `isKnownModel`, backed by one `models` binding — just needs a loader added |
| Harness model catalog consumers (untouched) | `src/completion/handlers.ts:130`, `src/harness/manager.ts:59`, `src/profile/agent-opener.ts:62` | Already call `modelsFor`/`isKnownModel` — no changes needed |
| Agent name pool consumers (switch import source only) | `src/commands.ts:62`, `src/agent/commands.ts:2,17` | Re-export and direct-use of the raw JSON — repoint at the new module |
| Config test pattern to mirror | `src/config.test.ts` (`mkdtempSync`/`writeFileSync`/`rmSync` per test) | Exercises missing/valid/invalid override files against a scratch project dir |

## Implementation steps

1. **`src/harness/models.ts`** — make `models` mutable and add a loader:
   ```ts
   import { existsSync, readFileSync } from 'node:fs';
   import path from 'node:path';
   import catalog from '../../harness-models.json' with { type: 'json' };

   let models: Record<string, string[]> = catalog;

   // Reads `.janissary/harness-models.json` from the project directory and, when present and
   // valid, uses it in place of the bundled catalog for the rest of this run — the same
   // load-with-fallback contract as `config.ts`'s `.janissary/config.json`.
   export function loadHarnessModels(projectDirectory: string): void {
     const overridePath = path.join(projectDirectory, '.janissary', 'harness-models.json');
     if (!existsSync(overridePath)) { models = catalog; return; }
     try {
       models = JSON.parse(readFileSync(overridePath, 'utf8')) as Record<string, string[]>;
     } catch {
       process.stderr.write('warning: .janissary/harness-models.json is invalid JSON — using the bundled catalog\n');
       models = catalog;
     }
   }

   export function modelsFor(harness: string): string[] {
     return models[harness] ?? [];
   }

   export function isKnownModel(harness: string, model: string): boolean {
     return modelsFor(harness).includes(model);
   }
   ```

2. **`src/agent-names.ts`** (new file) — mirrors `config.ts`'s shape for the name-pool array:
   ```ts
   import { existsSync, readFileSync } from 'node:fs';
   import path from 'node:path';
   import defaultNames from '../agent-names.json' with { type: 'json' };

   export let agentNames: string[] = defaultNames;

   // Reads `.janissary/agent-names.json` from the project directory and, when present and valid,
   // uses it in place of the bundled name list for the rest of this run.
   export function loadAgentNames(projectDirectory: string): void {
     const overridePath = path.join(projectDirectory, '.janissary', 'agent-names.json');
     if (!existsSync(overridePath)) { agentNames = defaultNames; return; }
     try {
       agentNames = JSON.parse(readFileSync(overridePath, 'utf8')) as string[];
     } catch {
       process.stderr.write('warning: .janissary/agent-names.json is invalid JSON — using the bundled name list\n');
       agentNames = defaultNames;
     }
   }
   ```

3. **`src/commands.ts:62`** — replace the raw re-export with:
   ```ts
   export { agentNames } from './agent-names.js';
   ```

4. **`src/agent/commands.ts:2`** — replace the raw import with:
   ```ts
   import { agentNames } from '../agent-names.js';
   ```

5. **`src/main.ts`** — alongside the existing `loadConfig(cwd)` (`:157`), import and call the two
   new loaders:
   ```ts
   import { loadAgentNames } from './agent-names.js';
   import { loadHarnessModels } from './harness/models.js';
   ...
   loadConfig(cwd);
   loadAgentNames(cwd);
   loadHarnessModels(cwd);
   ```

## Tests

- **`src/agent-names.test.ts`** (new, mirrors `src/config.test.ts`'s tmp-dir pattern):
  - falls back to the bundled list when no override file exists
  - reads a valid `.janissary/agent-names.json` array and uses it in place of the bundled list
  - falls back to the bundled list and warns on stderr when the override file is invalid JSON
- **`src/harness/models.test.ts`** (extend the existing file with a new `describe('loadHarnessModels')` block, same tmp-dir pattern):
  - falls back to the bundled catalog when no override file exists
  - reads a valid `.janissary/harness-models.json` object and `modelsFor`/`isKnownModel` reflect it
  - falls back to the bundled catalog and warns on stderr when the override file is invalid JSON

## Docs

- **`documentation/user-documentation/advanced-agents/harness.md`** — add a short note near the
  existing `--model` / `harness-models.json` mention (`:44`) that a project can supply its own
  `.janissary/harness-models.json` to override the bundled catalog.
- **`product/specs/agents.md`** and **`product/specs/harness.md`** — this is user-visible behavior
  (a functional spec), so both get a short addition describing the override files, per Step 5 of the
  fix-a-small-issue task.

## Out of scope

- Deep-merging project overrides with the bundled catalog (e.g. "add one model to claude's list
  without repeating the rest") — the issue asks for the project file to *override* the package's,
  matching `config.json`'s existing whole-document-override contract, not merge semantics.
- A `.janissary/agent-names.json` / `.janissary/harness-models.json` write-on-first-run scaffold
  (unlike `config.json`, which writes itself out if missing) — these are optional override files,
  not settings a user is expected to edit in place; only reading them is in scope.
