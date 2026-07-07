# Scheduling of Multistep Procedures

**Complexity: 4/10** — two small new modules plus a command, but correctness hinges on picking the right existing dispatch primitive (`CaptureManager.run`) instead of hand-rolling busy-polling, and on documenting the real limits of failure detection for `msg` and harness steps.

## Summary

Add a way to define, store, and execute multistep procedures in any tab, including harnesses. Procedures live as markdown files in a `./procedures` directory, with steps enumerated in a `steps` section as a bulleted list of commands. A `run <procedure-name>` command executes all steps sequentially in the current tab, with configurable delay between steps.

## Decisions (to be confirmed with user)

1. **Storage: `./procedures/` directory, markdown files.** Each procedure is a single `.md` file with a dasherized name (e.g., `deploy-staging.md`). The filename (minus `.md`) is the procedure name used in the `run` command.
2. **Format: markdown with a `## Steps` section.** The `steps` heading (case-insensitive) contains a bulleted list where each bullet is a command to send. Bullets use `-` or `*`. Non-bulleted lines and other headings are ignored. This is human-readable and git-friendly.
3. **Execution: sequential, with delay.** `run deploy-staging` sends each command in order, waiting a configurable delay between steps (default 500ms, overridable per-procedure via a `delay: <ms>` frontmatter field). The delay prevents overwhelming agents that need time to process between messages.
4. **Target: current tab only.** `run` executes steps in the tab that issued the command. To target a different tab, use `run deploy-staging` from that tab (click into it first), or compose with scheduling (`schedule add "run deploy-staging" in <target>`).
5. **Error handling: stop-on-error by default, and only ACP steps have a distinguishable failure signal.** The codebase has no structured success/failure return value for command dispatch in general — `src/capture-manager.ts`'s `CaptureManager.run(label, text, callback)` always calls `callback` with whatever output text was produced, whether the step "succeeded" or not. The one recognizable exception is an ACP agent turn that errors: `src/acp-manager.ts:119` calls its `onDone` with an output string prefixed `"ACP error: "`. So failure detection is: a step run directly in the current tab's own ACP session whose captured output starts with `"ACP error: "` counts as failed; every other step kind (a `msg` to another tab, a generic app command, a harness PTY write) always counts as succeeded, because there is no signal to check. A `continue-on-error: true` frontmatter field still exists for symmetry with the format, but in practice only changes behavior around ACP-step failures. The transcript shows which steps ran and which failed.
6. **No output capture into a separate tab.** Output from each step goes into the issuing tab's transcript, same as if the user typed each command manually. This keeps the mental model simple: `run` is equivalent to typing N commands in sequence. Note this is also just what already happens: a `msg` step (`src/commands/msg.ts`) only ever appends a one-line confirmation ("→ target (kind): text") to the issuing tab and returns immediately — it does not wait for the target tab to finish processing. So a procedure step that reads `msg build-agent "..."` fires and moves on to the next step after the `delay`, the same way a human typing `msg build-agent "..."` twice in a row would; `run` never blocks on another tab's turn. The wait-for-completion behavior described below only applies when a step is processed by the *issuing* tab itself (a bare prompt or `acp <prompt>` routed to that tab's own ACP session).

## What already exists (reuse, don't rebuild)

| Need | Existing mechanism | Location |
| --- | --- | --- |
| Dispatch one command to a tab and get its output back via callback (the exact "run a step, then move to the next" primitive) | `CaptureManager.run(label, text, callback)` — already used this way for `msg`'s `command`/`request` kinds | `src/capture-manager.ts:9` |
| Waiting for an ACP agent's turn to finish before proceeding | Not a poll — `CaptureManager.run` special-cases `c.name === 'acp'` and forwards straight to `managers.acp.run(label, trimmed, callback)`, whose `callback` fires from ACP's own `finished`/`error` hooks (`src/acp-manager.ts:113-119`) | `src/capture-manager.ts:38`, `src/acp-manager.ts:92-121` |
| Load a single named markdown file from a project-root subdirectory, plus list all available names | `loadPersona(name, root)` / `listPersonas(root)` — same shape of problem (`ai/personas/<name>.md`), already defaults `root = process.cwd()` | `src/personas.ts:19-51` |
| Typing text into a harness PTY with a short delay, no completion signal | `ScheduleManager.fire()`'s harness branch: gates on `tab.harness?.status === 'running'` and `tab.harness.ptyId`, writes via `managers.pty.input(ptyId, text)`, no wait for a response | `src/schedule-manager.ts:85-97` |
| Command-line tab-completion wired per-command (the precedent for completing procedure names) | `Controller.complete()` assembles a `{ personas, targets }` object and passes it through `completeCommandLine`, which tries a chain of per-command handlers (e.g. `completeMonitorCommand`) | `src/controller.ts:173-185`, `src/completion.ts:22-54`, `src/completion-handlers.ts` |
| Deciding whether typed text is a recognized command, a shell command, or free text routed to whatever connection is open (db/acp/browser) in the current tab | `resolveCommand` / `resolveUnknownCommand` — this is why a bare procedure step like `deploy the build` gets routed to the current tab's ACP session as a prompt when no command matches | `src/command-manager.ts:58-76`, `src/command-router.ts:6-24` |

## Verified codebase facts that shape the design

- **Scheduling already provides timed execution**, but is not the reusable piece here. `ScheduleManager.tick()` dispatches commands on a one-second interval via `this.managers.command.dispatchTo` (`src/schedule-manager.ts:96`) — there is no `CommandRouter` class. `CommandManager` (`src/command-manager.ts`) is the real per-tab dispatcher, but it's fire-and-forget (`dispatch`/`dispatchTo`/`run`) with no completion callback, so it is the wrong primitive for a runner that must wait between steps. `CaptureManager.run` (above) is the one that already returns output via callback and is the right thing to reuse.
- **There is no `Controller.handleCommand()`.** Per-tab command processing happens in `CommandManager.run()` (`src/command-manager.ts:45-76`), reached via `dispatch`/`dispatchTo`. Sequential execution is still natural — just built on `CaptureManager.run`'s callback rather than on hand-rolled polling.
- **ACP busy/idle tracking is `TabManager.isBusy(label)` / `addBusy(label)` / `deleteBusy(label)`** (`src/tab-manager.ts:22,42,54,58`), not `startRunning`/`finishRunning` (those are a separate convention used by browser/monitor/connection managers, `src/tab-manager.ts:179-199`, and add to the same underlying `busy` set but are not what ACP uses). None of this needs to be polled directly by the procedure runner: `CaptureManager.run`'s `acp` branch already surfaces turn completion via callback (see table above).
- **`msg` sends text to arbitrary tabs, but does not wait for the target to respond.** `src/commands/msg.ts` calls `managers.communication.send(...)` and immediately appends a one-line confirmation to the issuing tab; the actual delivery/processing happens later, asynchronously, in `AgentCommunicationManager.pump`/`handle` (`src/agent-communication-manager.ts:33-78`). A procedure step written as `msg <label> <command>` therefore never blocks the runner on the target tab's turn — see Decision 6.
- **File reading for a named-file-in-a-directory feature already has a precedent that is not `src/openers/editor.ts`.** That opener only `statSync`s a file to check its size for the editor UI (`src/openers/editor.ts:23-33`); it never reads file contents. The real precedent is `src/personas.ts` (see table above) — `src/procedure-parser.ts` should follow that file's shape: `readFileSync`/`readdirSync` under `path.join(root, 'procedures')` with `root: string = process.cwd()`.
- **No YAML/frontmatter parsing library is a project dependency** (`package.json` has no `yaml`, `js-yaml`, or `gray-matter`). The `steps`-section and frontmatter parsing in `src/procedure-parser.ts` must be hand-written line-oriented parsing, not a library call — a simple regex/line scan is sufficient for the two supported frontmatter fields (`delay`, `continue-on-error`), matching the original design's intent.
- **Markdown rendering (`web/src/markdown.ts`) is unrelated** — it renders markdown to HTML client-side and has nothing to do with extracting a bulleted list server-side. Not reusable here; disregard the earlier "could be done server-side via existing markdown libraries" framing.

## Proposed changes

### 1. Procedure file format

Example procedure (`procedures/deploy-staging.md`):

```markdown
---
delay: 2000
continue-on-error: false
---

# Deploy to Staging

Runs the full deploy pipeline: build, test, push, notify.

## Steps

- agent build-agent
- schedule add "npm install && npm run build" every 5m
- msg build-agent "start the production build"
- msg deploy-agent "deploy the latest build to staging"
- msg monitor-agent "watch the staging deploy logs"
```

Rules:
- Filename must be dasherized (`/^[a-z][a-z0-9-]*$/`).
- `steps` heading is case-insensitive, matched at start of line.
- Each step is a `- ` or `* ` bullet, trimmed of whitespace.
- Blank lines and lines not in the `steps` section are ignored.
- Optional YAML frontmatter for metadata (`delay`, `continue-on-error`).

### 2. Procedure parser

- New module `src/procedure-parser.ts`, shaped like `src/personas.ts` (`loadPersona`/`listPersonas`):
  - `parseProcedure(raw: string): ParseResult` — extracts frontmatter, steps list, via hand-written line-oriented parsing (no YAML library is a project dependency — see Verified codebase facts).
  - `loadProcedure(name: string, root: string = process.cwd()): ParseResult` — reads `path.join(root, 'procedures', name + '.md')` via `readFileSync`, throws a `No procedure "<name>" (looked in procedures/<name>.md).`-style error on a missing file (matching `loadPersona`'s error message shape), calls `parseProcedure`.
  - `listProcedures(root: string = process.cwd()): string[]` — `readdirSync(path.join(root, 'procedures'))`, filtered to `.md`, names sorted, `[]` on a missing directory (matching `listPersonas`'s shape exactly — this is also what feeds `run --list` and completion).
  - `ParseResult` type: `{ name: string; steps: string[]; delay: number; continueOnError: boolean }`. Defaults: `delay = 500`, `continueOnError = false`.
  - Validation: rejects empty steps, malformed frontmatter, files not found, non-dasherized names.

### 3. Procedure runner

- New module `src/procedure-runner.ts`:
  - `runProcedure(name: string, label: string, managers: Managers): Promise<void>` — loads the procedure via `loadProcedure`, appends a `[run] Starting <name> (N steps)` progress line to the issuing tab (`managers.tab.append`), then runs steps sequentially:
    1. Append a progress line `[run] Step i/N: <step text>` to the issuing tab's transcript (a `'message'`-shaped `LogEntry`, matching how `AgentCommunicationManager.handle` appends info lines).
    2. If the issuing tab's `view === 'harness'`: write the step text to the PTY exactly like `ScheduleManager.fire()`'s harness branch (`tab.harness?.status === 'running'` and `tab.harness.ptyId` gate, `managers.pty.input(ptyId, text)`, then a separate `\r` write after a short delay to mimic organic typing — same reason as `src/schedule-manager.ts:90-93`), then wait `delay` ms before the next step. There is no completion signal for harness steps (see Decision 5) — always proceed as success.
    3. Otherwise (agent tab or any other view): dispatch via `managers.capture.run(label, step, callback)` and wait for `callback` before proceeding. This is the same primitive `AgentCommunicationManager` uses for `msg`'s `command`/`request` kinds, and it already resolves ACP turns, shell runs, and generic app commands uniformly (see "What already exists" table). Do not poll `TabManager.isBusy`/`addBusy`/`deleteBusy` directly — `CaptureManager.run`'s callback already reflects ACP turn completion.
    4. After the callback fires, check for failure: only when the step was routed to this tab's own ACP session (i.e. `managers.tab.tabs.find(t => t.label === label)` has an open ACP connection and the step wasn't itself a `msg`/other-tab-targeted command) and the returned output starts with `"ACP error: "` — treat as failed. Every other step kind always counts as succeeded (see Decision 5). On failure, stop unless `continueOnError`; append `[run] Step i/N failed, stopping` (or `, continuing` if `continueOnError`).
    5. Delay `delay` ms between steps regardless of dispatch kind, so ACP turns that resolve instantly don't fire steps back-to-back with no pacing.
  - Append a final `[run] Finished <name>: N/M steps ran` progress line.

### 4. `run` command

- New `src/commands/run.ts`, registered in `src/commands/index.ts` alongside the other `Command` entries (see `src/commands/agent.ts` for the minimal shape: `name`, `match`, `run`):
  - Syntax: `run <procedure-name>`.
  - Parses the name, calls `loadProcedure`; on a thrown error, appends the error message to the tab (matching how other commands report bad input, e.g. `src/commands/msg.ts:9`).
  - Invokes `runProcedure(name, tab.label, managers)` and returns immediately — `runProcedure` is async and reports its own progress into the transcript as it goes, so `run`'s `run()` handler does not await it.
  - If no `procedures/` directory exists or is empty (`listProcedures()` returns `[]`), appends a message suggesting creating one, with an example filename.
  - A `run --list` flag (matching the existing `unmonitor --all` flag convention, `src/commands/monitor.ts:29`) appends the sorted output of `listProcedures()` to the tab.
- Completion: add a `completeProcedureName` handler in `src/completion-handlers.ts` (mirroring `completeMonitorCommand`'s persona completion), wire it into the `??` chain in `src/completion.ts:41-48`, and thread `listProcedures()` through `Controller.complete()` (`src/controller.ts:173-185`) the same way `listPersonas()` is threaded in today.
- Integration: command registration in `src/commands/index.ts` (not `src/command-router.ts`, which only resolves *unrecognized* input — `run` is a recognized command matched by name) and a new entry in `specs/application-commands.md`.

### 5. Agent integration

- `run` is already usable by an ACP agent with no extra work: an agent's own text output is routed through the normal command pipeline the same as human-typed input, so an agent typing `run deploy-staging` in its own tab hits `src/commands/run.ts` exactly like a human would. Nothing in this plan is coupled to `plans/draft/agent-self-service-tab-orchestration.md` — that plan (still in `draft/`, not yet implemented) adds a *different* mechanism (agent-issued commands dispatched via ACP tool calls rather than typed text). If it lands, `run` will compose with it automatically for the same reason `msg`/`schedule`/every other existing command already does, with no changes needed here. Do not block this plan on that one landing first.

### 6. Specs

- New `specs/procedures.md`: file format, parsing rules, frontmatter, execution model, error handling and its real limits (only ACP steps in the issuing tab are detectably fail-able; `msg` and harness steps always count as succeeded — see Decision 5), `run` command syntax, tab-completion, composition with scheduling.
- `specs/application-commands.md`: add `run` command, matching the existing entries' shape (see `help`/`state`/`clear` sections).

### 7. Tests (colocated, run via `./scripts/run.mjs check-diff`)

- `src/procedure-parser.test.ts`: parses a valid file, rejects missing file, validates frontmatter defaults, rejects non-dasherized names, handles missing `steps` section, ignores non-bulleted lines.
- `src/procedure-runner.test.ts`: executes steps sequentially with correct delays; a step that resolves via `CaptureManager.run`'s ACP branch with `"ACP error: "`-prefixed output stops the run unless `continueOnError`; a `msg` step's immediate confirmation-only callback does not stop the run and does not wait for the target tab; harness steps write to PTY per `ScheduleManager.fire()`'s pattern and always count as succeeded; progress lines are appended with the `[run]` prefix.
- `src/commands/run.test.ts`: `run --list` lists procedures via `listProcedures()`, `run` with an unknown name appends `loadProcedure`'s error message, `run` with no `procedures/` directory suggests creating one.
- `src/completion-handlers.test.ts` (existing file): add a case for the new `completeProcedureName` handler, mirroring the existing `completeMonitorCommand` persona-completion test.
- Integration test: create a `./procedures/test-proc.md` with two harmless steps in a temp directory (matching the temp-dir convention other manager tests use for filesystem isolation), `run test-proc` from an agent tab, verify steps appear in transcript with `[run]` prefix.

## Out of scope

- Editing or deleting procedures from within the app (`procedures/` is a plain git-tracked directory; use a normal editor or `edit <path>`).
- Nested/composed procedures (a step that itself calls `run <other-procedure>`).
- Retrying a failed step, or resuming a partially-run procedure.
- Any change to `plans/draft/agent-self-service-tab-orchestration.md` or dependency on it landing (see Agent integration above).

## Verification

- `./scripts/run.mjs check-diff` after each implementation step (per CLAUDE.md, this is the standard dev-loop check — lint/typecheck/tests scoped to the changed files).
- Manual end-to-end check: create `procedures/smoke-test.md` with two harmless steps (e.g. two `msg`-free `echo`-style shell steps, or two prompts to a running ACP agent), run `run smoke-test` from a tab, and confirm in the UI that: progress lines (`[run] Step 1/2: ...`) appear in order, the configured `delay` is visibly respected between steps, and `run --list` shows `smoke-test` in its output.

## Implementation order

1. Procedure parser: `src/procedure-parser.ts` (`parseProcedure`/`loadProcedure`/`listProcedures`, personas.ts-shaped) + file format validation, tests. No dependency on later steps.
2. Procedure runner: `src/procedure-runner.ts` built on `CaptureManager.run` (agent/generic-command steps) and the `ScheduleManager.fire()`-style PTY write (harness steps), with delay and the ACP-only error check, tests. Depends on step 1 for `loadProcedure`.
3. `run` command: `src/commands/run.ts`, registered in `src/commands/index.ts`, tests. Depends on step 2 for `runProcedure`.
4. Tab-completion: `completeProcedureName` in `src/completion-handlers.ts`, wired into `src/completion.ts` and `Controller.complete()`. Depends on step 1 for `listProcedures`; independent of steps 2–3, can land in parallel with them.
5. Specs: new `procedures.md` + amendments to `application-commands.md`. Do last, once behavior is final.
6. Public documentation.

Each step should leave `./scripts/run.mjs check-diff` green before moving to the next. No dependency on `plans/draft/agent-self-service-tab-orchestration.md` (see Agent integration).
