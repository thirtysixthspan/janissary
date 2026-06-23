# AI.md

Guidance for AI assistants working in this repository.

## Project

**Janissary** — a full-screen terminal UI shell (binary: `janus`) built with [Ink](https://github.com/vadimdemedes/ink) v7 + React. It provides multiple agent tabs, per-tab state, persistent shell execution, and keyboard-driven navigation.

See `README.md` for user-facing docs and `SPEC.md` for the authoritative, detailed product specification. When behavior is ambiguous, `SPEC.md` is the source of truth — keep it in sync with code changes.

## Commands

```bash
npm start          # Run in dev via tsx (src/cli.tsx)
npm test           # Run the vitest suite once
npm run build      # Compile TypeScript to dist/ with tsc
npm run clean      # Remove dist/
npm run lint       # ESLint
npm run format     # Prettier --write
```

- Node 24 is required (see `.nvmrc`).
- Run a single test file: `npx vitest run src/commands.test.ts`.

## Architecture

ESM + TypeScript. Source in `src/`, compiled to `dist/`. Entry binary `bin/janus.mjs` resolves `dist/cli.js` → local `tsx` → `npx tsx` in that order.

Key modules:

- `src/cli.tsx` — the `App` root component, render entry, tab/shell orchestration, launch-mode handling (`--relaunch`).
- `src/commands.ts` — built-in command output (`getOutput`) and agent-name resolution (`resolveAgentName`).
- `src/shell-commands.ts` — shell command registry/dispatch.
- `src/shell.ts` — persistent per-tab shell process: `spawnShell`, `executeShellCmd`, `queryShellPwd`.
- `src/agent-state.ts` — load/save/list agent state files; state-dir lifecycle.
- `src/db.ts` — the `db` command: parse/execute SQLite create/delete/query/list (`runDbCommand`).
- `src/browser.ts` — per-tab Playwright browser (`launchTabBrowser`): isolated windows with goto/eval/shot/content; headless or headed.
- `src/browser-command.ts` — `browser` command parser (`parseBrowserCommand`) plus the ACP-loop helpers `extractBrowserCommand`/`BROWSER_PRIMER`.
- `src/connections.ts` — persistent SQLite connection registry (open/close/list) plus the `connection` command parser (kinds: sqlite/shell/acp/browser).
- `src/schedule.ts` — `schedule` command parser (`parseScheduleCommand`) and next-run math (`computeNextRun`, time/date helpers); pure, no I/O.
- `src/useScheduler.ts` — one-second tick that fires each open agent's due scheduled commands via the dispatcher (target-tab `createCommandHandler`).
- `src/acp.ts` — ACP client: spawn/drive an agent subprocess over JSON-RPC (`connectAcp`).
- `src/acp-loop.ts` — autonomous agent tool loop (`runAcpToolLoop`): run a proposed command, feed output back, repeat until done/capped.
- `src/tab.ts` — `Tab`/`LogEntry` types, `makeTab`, `dotColors`, transcript line-buffer flattening (`flattenBuffer`), history helpers.
- `src/useInputHandler.ts` — keyboard input handling hook.
- `src/theme.ts` — `darkTheme` color tokens (single theme, no switcher yet).
- UI components: `src/TabStrip.tsx`, `src/Transcript.tsx`, `src/CommandWindow.tsx`, `src/ConnectionWindow.tsx`, `src/ScheduleWindow.tsx` (floating schedule list).

State: per-agent data (command history, transcript, shell cwd, schedule) persists to `.janussary/state/<name>.json`. Normal launch clears this dir; `janus --relaunch` restores all tabs from it.

## Conventions

Follow `CODE_GUIDELINES.md`:

- Keep JS/TS files at or under **200 lines**; extract modules when they grow past it. (`cli.tsx` and `useInputHandler.ts` are already over — prefer extracting when touching them rather than adding more.)
- One clear responsibility per file; group code by feature, avoid mixing unrelated concerns.

ESM specifics:

- `"type": "module"` with NodeNext resolution — **all relative imports use `.js` extensions** even for `.ts`/`.tsx` source (e.g. `import { getOutput } from './commands.js'`).
- JSON imports use import attributes: `import x from '../file.json' with { type: 'json' }`.

Prettier: semicolons on, single quotes, trailing commas everywhere, 100 print width, 2-space indent. ESLint: unused-vars is an error (prefix intentionally-unused with `_`).

## Testing

Tests use vitest + `ink-testing-library`, colocated as `*.test.ts(x)` in `src/` and excluded from the `tsc` build. Add or update tests alongside behavior changes; keep `commands.test.ts`, `shell.test.ts`, `tab.test.ts`, and the `cli` render/integration tests passing.