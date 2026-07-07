# Scheduling of Multistep Procedures

## Summary

Add a way to define, store, and execute multistep procedures in any tab, including harnesses. Procedures live as markdown files in a `./procedures` directory, with steps enumerated in a `steps` section as a bulleted list of commands. A `run <procedure-name>` command executes all steps sequentially in the current tab, with configurable delay between steps.

## Decisions (to be confirmed with user)

1. **Storage: `./procedures/` directory, markdown files.** Each procedure is a single `.md` file with a dasherized name (e.g., `deploy-staging.md`). The filename (minus `.md`) is the procedure name used in the `run` command.
2. **Format: markdown with a `## Steps` section.** The `steps` heading (case-insensitive) contains a bulleted list where each bullet is a command to send. Bullets use `-` or `*`. Non-bulleted lines and other headings are ignored. This is human-readable and git-friendly.
3. **Execution: sequential, with delay.** `run deploy-staging` sends each command in order, waiting a configurable delay between steps (default 500ms, overridable per-procedure via a `delay: <ms>` frontmatter field). The delay prevents overwhelming agents that need time to process between messages.
4. **Target: current tab only.** `run` executes steps in the tab that issued the command. To target a different tab, use `run deploy-staging` from that tab (click into it first), or compose with scheduling (`schedule add "run deploy-staging" in <target>`).
5. **Error handling: stop-on-error by default.** If a step produces an error (agent returns an error message, or harness command exits non-zero), execution stops. A `continue-on-error: true` frontmatter field allows all steps to run regardless. The transcript shows which steps ran and which failed.
6. **No output capture into a separate tab.** Output from each step goes into the issuing tab's transcript, same as if the user typed each command manually. This keeps the mental model simple: `run` is equivalent to typing N commands in sequence.

## Verified codebase facts that shape the design

- **Scheduling already provides timed execution.** `ScheduleManager.tick()` dispatches commands on a one-second interval. Multistep procedures are a different pattern — they run immediately, sequentially, with a short fixed delay — but share the same dispatch mechanism (`CommandRouter`).
- **Command processing is synchronous per-tab.** `Controller.handleCommand()` processes one command at a time. Sequential execution is natural: send step 1, wait for the response to settle (ACP response lands, or PTY output pauses), send step 2.
- **ACP agents have a busy/idle cycle.** `TabManager.startRunning(label)` / `finishRunning(label)` tracks whether an agent is processing. A `run` command targeting an ACP agent must wait for `finishRunning` before sending the next step.
- **`msg` already sends text to arbitrary tabs.** Under the hood, each step is dispatched as a `msg <label> <command>` (for agent tabs) or via `ptyInput` (for harness tabs). The procedure runner abstracts over this dispatch.
- **File reading is already available.** `src/openers/editor.ts` reads files from disk. The procedure runner reads `.md` files from `path.resolve(process.cwd(), 'procedures', name + '.md')`.
- **Markdown parsing is available client-side and could be done server-side via existing markdown libraries.** While `web/src/markdown.ts` exists for rendering, the server only needs to extract the bulleted list from the `steps` section — a simple regex or line-oriented parser suffices.

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

- New module `src/procedure-parser.ts`:
  - `parseProcedure(raw: string): ParseResult` — extracts frontmatter, steps list.
  - `loadProcedure(name: string): ParseResult` — reads `./procedures/<name>.md`, calls `parseProcedure`.
  - `ParseResult` type: `{ name: string; steps: string[]; delay: number; continueOnError: boolean }`. Defaults: `delay = 500`, `continueOnError = false`.
  - Validation: rejects empty steps, malformed frontmatter, files not found, non-dasherized names.

### 3. Procedure runner

- New module `src/procedure-runner.ts`:
  - `runProcedure(name: string, tab: Tab, controller: Controller): Promise<void>` — loads the procedure, then for each step:
    1. Determines the dispatch target (always the issuing tab).
    2. Dispatches the command via `controller.handleCommand(tab.label, step)`.
    3. If the tab is an ACP agent: waits for `finishRunning` (poll via a promise that resolves on the next `state` broadcast where `busy === false`).
    4. If the tab is a harness: writes to PTY via `ptyInput`, waits `delay` ms between writes.
    5. Delays `delay` ms between steps.
    6. If a step fails (ACP returns an error message pattern): stops unless `continueOnError`.
  - Reports progress to the transcript: each step prefixed with `[run] Step 1/4: agent build-agent` as a `'message'` type `LogEntry`.

### 4. `run` command

- New `src/commands/run.ts`:
  - Syntax: `run <procedure-name>`.
  - Parses the name, loads the procedure, invokes `runProcedure`.
  - Completion: tab-complete on procedure names (`readdir` the `./procedures` directory).
  - If no procedures directory exists or is empty, suggests creating one with an example file.
  - A `run --list` flag lists all available procedures.
- Integration: command registration in `src/command-router.ts` and `specs/application-commands.md`.

### 5. Agent integration

- When an ACP agent issues `run deploy-staging`, the procedure runs within the agent's own tab. Each step is processed as if the agent itself typed the command. This composes naturally with the agent-self-service API (`plans/draft/agent-self-service-tab-orchestration.md`).

### 6. Specs

- New `specs/procedures.md`: file format, parsing rules, frontmatter, execution model, error handling, `run` command syntax, tab-completion, composition with scheduling.
- `specs/application-commands.md`: add `run` command.

### 7. Tests (colocated, run via `./scripts/run.mjs check-diff`)

- `src/procedure-parser.test.ts`: parses a valid file, rejects missing file, validates frontmatter defaults, rejects non-dasherized names, handles missing `steps` section, ignores non-bulleted lines.
- `src/procedure-runner.test.ts`: executes steps sequentially with correct delays, respects `continueOnError`, handles ACP busy-wait, handles harness PTY writes, progress reporting.
- `src/commands/run.test.ts`: `run --list` lists procedures, `run` with invalid name errors, `run` completion.
- Integration test: create a `./procedures/test-proc.md` with two harmless steps, `run test-proc` from an agent tab, verify steps appear in transcript with `[run]` prefix.

## Implementation order

1. Procedure parser: `src/procedure-parser.ts` + file format validation, tests.
2. Procedure runner: `src/procedure-runner.ts` with sequential dispatch, delay, error handling, tests.
3. `run` command: `src/commands/run.ts` + tab-completion, tests.
4. Agent integration: validate `run` from within ACP tool loop (composes with agent-self-service plan).
5. Specs: new `procedures.md` + amendments to commands.
6. Public documentation.

Run `./scripts/run.mjs check-diff` after each step.
