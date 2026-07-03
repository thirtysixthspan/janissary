# Scheduled harness via profile

**Complexity: 4/10** — server-only and reuse-heavy (schedule delivery, PTY spawn, and tab cleanup all exist), but correctness depends on catching several call sites: the profile loader rename, the launch-semantics change from skip to close-and-reopen, and the harness-PTY-exit path that silently ends a scheduled loop.

## Goal

A profile can launch an AI harness tab, send it a command to execute immediately, and schedule subsequent commands to run in that harness on a recurring timer. One `profile launch <name>` sets up the whole loop.

First concrete profile — `small-fix`:

- launches the **opencode** harness,
- with the model **DeepSeek V4 Pro** selected,
- types `execute ./ai/fix-a-small-issue.md` into the harness immediately,
- and schedules the same command **every 30m** under the schedule name **small-fix**.

This is the profile-shaped version of the manual flow already sketched in `docs/commands.md`:

```
schedule small-fix in opencode every 30m execute ./ai/fix-a-small-issue.md
```

## What already exists (reuse, don't rebuild)

| Piece | Where | Notes |
|---|---|---|
| Profiles: dir of `<name>.json` agent-state files, `profile launch/list` | `src/profiles.ts` (`loadProfileAgents`), `src/profile-manager.ts`, `src/profile-agent-opener.ts` (`openProfileAgents`) | Opens **agent** tabs only; restores `schedule` from `AgentState.schedule` at `profile-agent-opener.ts:32` |
| Harness tabs: PTY-backed full-tab view | `src/harness.ts` (`HARNESS_COMMANDS`, parser), `src/harness-manager.ts` | No model selection; label uniquing; optional `--workspace` clone |
| Schedules per tab, 1s firing loop | `src/schedule-manager.ts`, `src/schedule.ts`, `src/commands/schedule.ts` | **Already delivers to harness tabs**: `fire` (`schedule-manager.ts:85`, branch `if (tab.view === 'harness')`) types `command\r` into the PTY and retries while `harness.status !== 'running'`; harness schedules are memory-only |
| Typing into a harness PTY on demand | `src/commands/send.ts` (`deliverTo`) | Same delivery mechanism the scheduler uses |
| PTY spawn runs a shell command string | `src/pty.ts:36` (`pty.spawn(shell, ['-lc', command], …)`) | The command string can carry flags, so a model flag needs no env plumbing |
| Tab close frees everything | `TabManager.closeTab` (`src/tab-manager.ts:136`) → `closeTabResources` (`src/tab-cleanup.ts:5`) | Kills the tab's PTYs, deletes its schedule, removes its workspace clone — relaunch reuses this, adds no cleanup code |
| Root-level committable JSON config | `src/commands.ts:61`: `export {default as agentNames} from '../agent-names.json' with { type: 'json' }` | The import pattern `harness-models.json` copies |
| Model-selection precedent | `src/persona-parsing.ts` (harness:model:variant directive), `src/monitor-acp.ts` (`OPENCODE_CONFIG_CONTENT`) | Personas already treat "harness + model" as a unit |

The gaps: (1) a profile file cannot describe a harness tab, (2) a harness cannot be launched with a model, (3) profile files cannot author schedules portably (`ScheduleEntry.nextRun` is an epoch timestamp, meaningless in a committed file), (4) nothing runs a command in a harness "immediately after launch".

## Design

### Profile harness entries

A profile file whose JSON contains a `harness` key describes a harness tab instead of an agent. The filename (minus `.json`) is the tab label, as for agents. New type (in `src/types.ts` next to `AgentState`):

```ts
export type ProfileHarnessEntry = {
  harness: string;            // 'claude' | 'opencode' | 'codex' — validated against HARNESS_COMMANDS
  model?: string;             // passed to the harness binary via its --model flag, verbatim
  number?: number;            // tab-order, same as agent files
  dotColor?: string;          // same handling as agent files
  workspace?: boolean;        // launch in a fresh workspace clone (default false)
  cwd?: string;               // starting directory (default: creator tab's cwd)
  run?: string[];             // commands typed into the harness once, shortly after launch
  schedule?: string[];        // authored schedule lines, schedule-command grammar (see below)
};
```

`loadProfileAgents` generalizes to `loadProfileEntries(): ProfileEntry[]` where `ProfileEntry = AgentState | ProfileHarnessEntry`, discriminated by the presence of `harness`. Ordering by `number` and invalid-file skipping stay as they are. Existing agent-only profiles parse exactly as before.

### Authored schedules (portable, no epoch timestamps)

`schedule` entries in a harness profile file are **strings in the existing `schedule` command grammar**, minus the `in <tab>` clause (the tab is implicitly this entry's tab):

```
"small-fix every 30m execute ./ai/fix-a-small-issue.md"
```

At launch, each string is parsed with `parseScheduleCommand` (reusing the grammar, name/duplicate handling, and `nextRun` math for free). A string that parses to an error, or that carries an `in <tab>` target, is reported in the launch output and skipped. This avoids inventing a second schedule grammar and keeps `schedule list`/`cancel`/`clear in <tab>` working on the result.

Agent profile files keep their existing typed `ScheduleEntry[]` form — no change, no dual format in one field.

### Immediate execution (`run`)

Each `run` string becomes a **one-shot ScheduleEntry** (`id: run-1, run-2…`, `recurring: false`) with `nextRun = Date.now()`, so it fires on the first scheduler tick once the harness PTY is up. This reuses the scheduler's existing harness delivery and its retry-while-not-running behavior, and makes the pending command visible in the schedule panel until it fires.

No startup delay is needed: opencode buffers stdin that arrives before its UI is ready, so input typed immediately after spawn is not lost. (If a future harness turns out to drop early input, a per-harness launch delay can be reintroduced then.)

Rejected alternative: opencode's CLI has a `--prompt <text>` flag that could carry the first command at spawn. Rejected because the one-shot route works for any number of `run` strings, shows the pending command in the schedule panel, and is uniform across harnesses — no per-harness prompt-flag mapping.

### Model catalog (`harness-models.json`)

The known model ids per harness are maintained in a committable config file at the repo root — `harness-models.json` — mirroring the existing `agent-names.json` pattern (root-level JSON, imported with `with { type: 'json' }`, `.json` extension required by NodeNext). Keyed by harness name so other harnesses can be added later:

```json
{
  "opencode": [
    "opencode/big-pickle",
    "opencode/deepseek-v4-flash-free",
    "opencode/mimo-v2.5-free",
    "opencode/nemotron-3-ultra-free",
    "opencode/north-mini-code-free",
    "opencode-go/deepseek-v4-flash",
    "opencode-go/deepseek-v4-pro",
    "opencode-go/glm-5.1",
    "opencode-go/glm-5.2",
    "opencode-go/kimi-k2.6",
    "opencode-go/kimi-k2.7-code",
    "opencode-go/mimo-v2.5",
    "opencode-go/mimo-v2.5-pro",
    "opencode-go/minimax-m2.7",
    "opencode-go/minimax-m3",
    "opencode-go/qwen3.6-plus",
    "opencode-go/qwen3.7-max",
    "opencode-go/qwen3.7-plus",
    "google/gemini-2.5-flash",
    "google/gemini-2.5-flash-image",
    "google/gemini-2.5-flash-lite",
    "google/gemini-2.5-flash-preview-tts",
    "google/gemini-2.5-pro",
    "google/gemini-2.5-pro-preview-tts",
    "google/gemini-3-flash-preview",
    "google/gemini-3-pro-image-preview",
    "google/gemini-3.1-flash-image-preview",
    "google/gemini-3.1-flash-lite",
    "google/gemini-3.1-pro-preview",
    "google/gemini-3.1-pro-preview-customtools",
    "google/gemini-3.5-flash",
    "google/gemini-embedding-001",
    "google/gemini-flash-latest",
    "google/gemini-flash-lite-latest",
    "google/gemma-4-26b-a4b-it",
    "google/gemma-4-31b-it"
  ]
}
```

A small `src/harness-models.ts` helper wraps the import: `modelsFor(harness): string[]` and `isKnownModel(harness, model): boolean`. Keeping the list in config (not code) means adding a model is a one-line JSON edit, and later features (tab-completion of model ids, a `harness … --model` flag) read the same source.

A profile entry's `model` is **validated against this catalog at launch**: an unknown model is reported in the launch output — `Unknown model "<model>" for harness "<harness>" — add it to harness-models.json.` — and the entry is skipped, same as an unknown harness name. A typo'd model id would only fail later inside opencode, so failing loudly at launch keeps it legible. When a new model ships, add it to `harness-models.json` first; the opencode list can be regenerated from `opencode models`.

### Model selection

opencode's CLI takes `-m, --model` ("model to use in the format of provider/model" — verified via `opencode --help`). `buildHarnessCommand` appends `--model` for every harness; claude and codex also document a `--model` flag, but since the catalog currently lists only opencode models, validation rejects model selection for them anyway — re-verify their flags when their models are first added to the catalog. Add to `src/harness.ts`:

```ts
export function buildHarnessCommand(name: string, model?: string): string
// 'opencode' + 'opencode-go/deepseek-v4-pro' → "opencode --model 'opencode-go/deepseek-v4-pro'"
```

Single-quote the model value (with a quote-escaping helper) since `spawnPty` runs the string through `shell -lc`. The (catalog-validated) model id is passed to the binary verbatim.

`HarnessManager` uses `buildHarnessCommand` for the PTY command while keeping `program` as the display label.

### Launch flow

`openProfileAgents` (rename to `openProfileEntries`) branches per entry:

- **Agent entry** — existing path.
- **Harness entry** — validate `harness` against `HARNESS_COMMANDS` and `model` against `harness-models.json` (report and skip on either failing); open a harness tab via a new `HarnessManager.openFromProfile(entry, label, group, groupColor)` that mirrors `open()` but takes the profile's group/color and the entry's `cwd`/`workspace` instead of deriving them from the creator tab (when the entry has neither, default to the issuing tab's cwd, exactly what `resolveCwd` in `src/harness-manager.ts` does today). Then build the tab's schedule: parsed `schedule` strings plus the `run` one-shots, and `managers.schedule.set(label, entries)`. A duplicate schedule name within one entry keeps the first and reports the rest, mirroring the duplicate-id check in `src/commands/schedule.ts:40`. Unlike the agent branch, a harness entry is **never persisted** — no `tab.persist(buildAgentState(…))` call (harness tabs have no agent state; compare `profile-agent-opener.ts:33`).

**Relaunch semantics (behavior change).** A profile may be launched more than once. Before opening any entry, every open tab whose label matches a profile entry is **closed, then all entries open fresh** (close-all first, then open-all — so label collisions between closing and opening tabs cannot arise mid-launch). This replaces today's skip-with-`Already open: …` behavior, for agent and harness entries alike. Closing goes through the existing `TabManager.closeTab` path, whose `closeTabResources` (`src/tab-cleanup.ts`) already kills the tab's PTYs, deletes its schedules, and removes its workspace clone, so a relaunched harness gets a fresh process, a fresh schedule (timers re-based to now), and a fresh clone. Close by label lookup, not stored index (indices shift as tabs close). One guard: the tab issuing `profile launch` is never closed — if its label is named in the profile, that entry is reported and skipped, so the launch report always has somewhere to land. The guard also makes the `closeTab` last-tab edge unreachable from a relaunch: `TabManager.closeTab` quits the app when closing the last remaining tab (`tab-manager.ts:141`, "Closing the last remaining tab quits the app"), but the issuing tab always survives.

**Harness lifecycle bounds the loop.** When a harness PTY exits, the controller closes the whole harness tab (`src/controller.ts:56-60`, `closeTab(harnessIndex)` on the `pty` exit event), which deletes its schedule — so if opencode crashes or the user quits it, the scheduled loop silently ends with the tab. This is existing behavior; the plan does not change it, but `spec/profiles.md` must state it so a user knows a dead loop means the harness exited. (Relaunch's own PTY kill is safe from this path: by the time the exit event fires, the old tab is already gone, and the exit handler looks tabs up by `ptyId`, which is never reused.)

Group placement follows the existing rule — the whole profile (agents + harnesses) lands in one new group. Launch output lists opened harness tabs alongside agents, notes relaunched tabs, plus any skipped/invalid entries or schedule lines.

`HarnessManager.open` and `openFromProfile` should share their core (tab creation + PTY spawn) — extract a private helper so neither path duplicates the other.

### Persistence semantics (unchanged, but now spec'd)

Harness tabs have no persisted agent state, so a profile-launched harness and its schedule are memory-only: closing the tab, quitting the app, or the harness process exiting (see "Harness lifecycle bounds the loop") ends the loop, and `--relaunch` does not restore it. Re-running `profile launch small-fix` recreates the whole setup. This matches how harness schedules behave today and keeps the profile file the single source of truth.

## The `small-fix` profile

`profiles/small-fix/opencode.json`:

```json
{
  "harness": "opencode",
  "model": "opencode-go/deepseek-v4-pro",
  "number": 1,
  "run": [
    "execute ./ai/fix-a-small-issue.md"
  ],
  "schedule": [
    "small-fix every 30m execute ./ai/fix-a-small-issue.md"
  ]
}
```

The harness is started as `opencode --model 'opencode-go/deepseek-v4-pro'` (DeepSeek V4 Pro, per the catalog). The `run`/`schedule` text is typed into opencode as a prompt; opencode reads the referenced task file itself, exactly as in the `docs/commands.md` sketch.

## Implementation steps

1. **Types** — `ProfileHarnessEntry` + `ProfileEntry` union in `src/types.ts`.
2. **Model catalog** — `harness-models.json` at the repo root (contents above) + `src/harness-models.ts` (`modelsFor`, `isKnownModel`).
3. **Loader** — generalize `src/profiles.ts` to `loadProfileEntries` (filename-as-label, `number` ordering, skip invalid). Update every `loadProfileAgents` call site: `src/profile-manager.ts:2,23` and the imports/uses in `src/profiles.test.ts`. If the file nears the 200-line cap, extract entry parsing into `src/profile-entries.ts` (relative imports carry `.js` per NodeNext).
4. **Harness command building** — `buildHarnessCommand(name, model?)` + quoting helper in `src/harness.ts`; use it in `HarnessManager`.
5. **HarnessManager** — extract the shared open core; add `openFromProfile(entry, label, group, groupColor)`.
6. **Profile launch** — branch in `src/profile-agent-opener.ts` (extract a `src/profile-harness-opener.ts` if the file would exceed the cap): close matching open tabs first (relaunch semantics), then validate harness + model, open harness tabs, parse authored `schedule` strings via `parseScheduleCommand`, convert `run` to immediate one-shots, `schedule.set`, report.
7. **Example profile** — `profiles/small-fix/opencode.json`.
8. **Spec** — update `spec/profiles.md` (harness entries: schema, model catalog + validation, authored schedules, `run`, memory-only persistence, group placement, and the new close-and-reopen relaunch semantics replacing `Already open: …`) and cross-reference from `spec/harness.md` and `spec/scheduling.md`.
9. **Docs** — README profiles section gains a harness-entry example and a note that model ids live in `harness-models.json`; remove the now-covered sketch lines from `docs/commands.md` if desired.

## Tests

- `src/profiles.test.ts` — existing `loadProfileAgents` tests updated to the renamed `loadProfileEntries` (imports at `profiles.test.ts:9`, uses at `:64,73,77`); new cases: a harness file parses to a `ProfileHarnessEntry`; mixed agent+harness profiles order by `number`; invalid JSON still skipped; agent-only profiles unchanged.
- `src/harness-models.test.ts` — `modelsFor('opencode')` returns the catalog; `isKnownModel` accepts `opencode-go/deepseek-v4-pro` and rejects unknown ids and unknown harnesses.
- `src/harness.test.ts` — `buildHarnessCommand` with/without model; model values containing spaces/quotes are safely quoted.
- `src/controller.test.ts` (mock `spawnPty`, fake timers) — `profile launch small-fix`:
  - opens a harness tab labeled `opencode` running a command containing `--model`;
  - the tab's schedule holds the recurring `small-fix` entry (`intervalMs` 30m) and a `run-1` one-shot;
  - the first scheduler tick types `execute ./ai/fix-a-small-issue.md\r` into the PTY and drops the one-shot;
  - advancing 30m fires the recurring entry and reschedules it;
  - an unknown `harness` name, a model missing from `harness-models.json`, or a malformed schedule string is reported and skipped;
  - relaunching the profile while its tab is open closes the old tab (old PTY killed, schedule dropped) and opens a fresh harness tab with a re-based schedule;
  - a profile entry matching the issuing tab's label is reported and skipped, and the issuing tab stays open.
- `src/schedule-manager.test.ts` — already covers harness delivery/retry; extend only if an immediate (`nextRun` ≤ now at set-time) one-shot isn't already covered.

Existing profile-launch tests in `src/controller.test.ts` (`:84,97,389` — group formation and focus) stay green: they launch into empty tab sets, so the relaunch change doesn't alter their behavior.

## Verification

- `./scripts/run.mjs check-diff` after each step; all tests green.
- Manual end-to-end: start the app, run `profile launch small-fix`, and confirm — an `opencode` tab opens running DeepSeek V4 Pro (check the model shown in opencode's UI); within a couple of seconds `execute ./ai/fix-a-small-issue.md` appears in the opencode prompt and the harness starts working; `schedule list in opencode` shows `small-fix  every 30m` (the `run-1` one-shot has fired and dropped); re-running `profile launch small-fix` from the root tab closes the opencode tab and opens a fresh one with a re-based timer.

## Decisions

1. **Run delay** — none needed: opencode buffers stdin arriving before its UI is ready, so `run` one-shots fire on the first scheduler tick.
2. **Duplicate-label policy** — close-and-reopen: relaunching a profile closes any open tab named by a profile entry and reopens it per the profile (replacing the old skip-with-`Already open` behavior; the issuing tab is never closed).

## Out of scope

- **Web changes — none needed.** Harness tabs already render, and the schedule panel already floats over a harness tab (`StatusPanels` rendered `scheduleOnly` at `web/src/App.tsx:165`), so the small-fix timers are visible with zero client work.
- `--model` on the interactive `harness` command (natural follow-up; the `buildHarnessCommand` helper makes it cheap).
- Persisting/rehydrating harness tabs across `--relaunch`.
- Passing per-spawn environment variables to PTYs (the `--model` flag avoids needing it).
- Conditional chaining ("if changes are successful execute …" from `docs/commands.md` line 4) — that logic lives in the AI task file, not the scheduler.
- A `variant`/thinking-effort field (personas have one; harness CLIs don't map it uniformly).

## Checklist

- [ ] `ProfileHarnessEntry` type + `loadProfileEntries`
- [ ] `harness-models.json` catalog + `src/harness-models.ts` helper
- [ ] `buildHarnessCommand` + quoting; `HarnessManager.openFromProfile`
- [ ] Profile launch branch: harness tabs (model-validated) + authored schedules + `run` one-shots
- [ ] `profiles/small-fix/opencode.json` (model: `opencode-go/deepseek-v4-pro`)
- [ ] Specs: `profiles.md`, `harness.md`, `scheduling.md`
- [ ] Tests green via `./scripts/run.mjs check-diff`
