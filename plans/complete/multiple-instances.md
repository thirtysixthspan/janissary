# Spin Up Multiple Independent Instances of Janissary

**Complexity: 3/10** — one small new module (a PID-based lock file) plus wiring a directory-override flag through code paths that already take a `projectDir`/`cwd` parameter; no new protocol, persistence format, or UI surface.

## Summary

Make it easy to launch Janissary in a target directory such that each instance — server + UI — runs independently, bound to its own files, ports, and state. Two instances must never run against the same on-disk `.janissary/` directory at once (they'd race on state-directory clearing, the database, the transcript log, and the Chrome profile). A `janus --here=<directory>` flag lets a user start an instance targeting a directory without first `cd`-ing there.

**Verified against the repo, most of the plan's original premise does not hold** — see "Verified codebase facts" below. The server already self-isolates by port and by `cwd`; the only real gap is (a) a way to target a directory other than `cwd`, and (b) a guard against two processes sharing the same `cwd` concurrently.

## Decisions

1. **Isolation model: per-directory server, already true today.** Each Janissary instance is a separate OS process that reads/writes `.janissary/` under whichever directory it was told to treat as its root (`process.cwd()` today, or the resolved `--here` path once this lands). This requires no new code — `src/main.ts:120-136` already threads a single `cwd` value through every per-instance initializer (state, db, profiles, workspace, transcript logger/store, config, github token). The only change is *where that `cwd` value comes from* (see decision 2).
2. **Launch mechanism: `--here=<directory>` flag, required value.** `janus --here=<path>` resolves `<path>` (via `path.resolve`, relative to `process.cwd()`) and uses it as the instance's root directory everywhere `main.ts` currently uses `process.cwd()`. A bare `--here` with no directory is **not** supported — plain `janus` (no flag) already targets `process.cwd()` today (`src/main.ts:120`), so a no-argument `--here` would be a redundant alias for existing default behavior. `--here` is validated in `parseCliArgs` (`src/cli-args.ts`) the same way `--port` is validated today (`src/cli-args.ts:40-43`): if the resolved path does not exist or is not a directory, throw `CliUsageError` before anything starts.
3. **Port allocation: already automatic, no new code.** `src/index.ts:38,119-123` already binds with `options.port ?? 0` — passing `0` to `http.listen` asks the OS for a free ephemeral port. `src/cli-args.ts` already exposes `--port=<n>` (optional; omit it to auto-select), and this is already documented in `specs/cli.md:9,31,44`. There is no port-collision problem to solve and no `port-allocator.ts` module to write.
4. **State isolation: per-directory for project state, intentionally shared for global history.** `.janissary/state/`, `.janissary/workspace/`, `.janissary/config.json`, `.janissary/db/`, `.janissary/log/` are all rooted at the instance's directory (see decision 1) and are naturally independent across directories — no code changes needed. The one exception, by existing design, is **global command history**: `initGlobalHistory()` (`src/global-history.ts:21-23`) stores `~/.janissary/history.json` under the user's home directory regardless of `cwd`, and is meant to be shared across every instance on the machine. Do not attempt to isolate it — that would be a behavior change outside this plan's scope.
5. **Overlap detection: same-directory lock, not ancestor/descendant tree-walking.** Because state is isolated per exact directory (decision 4) rather than by directory-tree ancestry, a parent directory and a subdirectory each get their own independent `.janissary/`, and running instances in both simultaneously is safe and requires no rejection. The only real hazard is **two instances targeting the exact same directory**, which would race on `clearStateDirectory()` (`src/agent-state.ts:47-50`), the workspace clear (`src/workspace.ts`), the transcript store/logger, and the shared Chrome profile directory (`src/main.ts:89`, `path.join(projectDir, '.janissary', 'chrome')`). Guard this with a PID lock file, not a directory-tree walk (see "Proposed changes" below).

## What already exists (reuse, don't rebuild)

| Need | Existing mechanism | Location |
| --- | --- | --- |
| Ephemeral/explicit port binding | `startServer({ port })` passes `options.port ?? 0` to `http.listen` | `src/index.ts:119-123` |
| `--port` CLI parsing + validation pattern to mirror for `--here` | `parseCliArgs` | `src/cli-args.ts:15-52` |
| Per-instance directory threading | `boot()` passes one `cwd` value into every `init*`/`load*` call | `src/main.ts:106-136` |
| Startup error formatting (no changes needed — a plain `Error` thrown before the server starts already renders correctly) | `explainStartupError` / `formatFatal` | `src/startup-errors.ts` |
| Process-exit cleanup pattern to extend for lock release | `process.on('exit', killApp)` | `src/main.ts:147` |
| Cross-platform browser opening (already implemented, nothing to add) | `openApp` / `openUrl` | `src/main.ts:36-104` |

## Verified codebase facts that shape the design

- **No `JANUS_PORT` env var exists anywhere in `src/`.** The port comes from `--port=<n>` or auto-selection (`options.port ?? 0`), never an env var. (Original plan's claim was wrong — verified by grepping `src/` and `bin/`.)
- **There is no "connect to an existing instance" behavior today.** Every `janus` invocation spawns a brand-new server process (`src/main.ts:136`); `--relaunch` only reattaches *persisted agent state* on a fresh process (`specs/relaunch.md`), it does not discover or attach to an already-running server. The original plan's claim that plain `janus` "opens or connects to the existing instance" is fabricated — there is nothing to preserve here.
- **`specs/startup.md` does not exist.** The real startup-sequence documentation lives in `specs/cli.md:36-47`, which already lists 8 numbered boot steps in the same order `boot()` executes them. This plan's new lock-acquisition step slots in as a new step 1 (before `.janissary/` subdirectory initialization), and `--here` needs a row in the flags table (`specs/cli.md:5-13`).
- **`bin/janus.mjs` does no argument handling** — it only decides whether to run compiled `dist/main.js` or `src/main.ts` via `tsx`, forwarding `argv` untouched. All flag parsing and directory resolution happens in `src/cli-args.ts` / `src/main.ts`, not `bin/janus.mjs`.
- **State-directory clearing is a real, unguarded hazard today.** `clearStateDirectory()` (`src/agent-state.ts:47-50`) and the equivalent workspace/transcript clears in `boot()` (`src/main.ts:130`) run unconditionally (unless `--relaunch`) with no check for another live process using the same directory. Two `janus` processes started back-to-back in the same directory would have the second one delete state out from under the first while it's actively serving clients.

## Proposed changes

### 1. Same-directory instance lock

- New module `src/instance-lock.ts`:
  - `acquireLock(projectDir: string): void` — path is `path.join(projectDir, '.janissary', 'lock')`. If the lock file exists, read the PID it contains and check liveness with `process.kill(pid, 0)` wrapped in try/catch (`ESRCH` means the process is dead). If alive, throw a plain `Error` (no new error-code branch needed in `src/startup-errors.ts` — the existing fallback in `src/main.ts`'s top-level catch already renders any thrown `Error`'s `.message` via `formatFatal`) with a message naming the directory and the live PID, e.g. `another janus instance is already running in this directory (pid <n>). Use --here=<other-directory> to run a second instance elsewhere.` If the file is missing, or present but stale (dead PID), write the current process's PID to it (creating `.janissary/` first with `mkdirSync(..., { recursive: true })`, mirroring `ensureStateDirectory()` in `src/agent-state.ts:11-13`).
  - `releaseLock(projectDir: string): void` — reads the lock file; deletes it only if the PID inside matches `process.pid`. This makes release idempotent and safe to call even when `acquireLock` failed (in which case the file holds someone else's PID and is correctly left untouched) — no separate "did we acquire it" flag needs to be threaded through `boot()`.
- `src/main.ts`: call `acquireLock(targetDir)` as the **first** action inside `boot()`, before `initAgentStateDirectory` and the other `init*`/`load*` calls (so a rejected lock never touches another live instance's directories). Add `releaseLock(targetDir)` to the existing `process.on('exit', killApp)` handler at `src/main.ts:147` (extend that single handler to call both, rather than registering a second `exit` listener).

### 2. CLI: `--here` flag

- `src/cli-args.ts`: add a `here: { type: 'string' }` entry to the `parseArgs` options (alongside `port` at `cli-args.ts:25`), and a `here: string | undefined` field on `CliArgs`. Validate immediately after parsing, the same way `port` is validated at `cli-args.ts:40-43`: if `values.here` is set, resolve it with `path.resolve(values.here)` and check `existsSync(resolved) && statSync(resolved).isDirectory()`; if either check fails, throw `CliUsageError` with a message naming the path. Store the *resolved* path on `CliArgs.here` so `main.ts` never has to re-resolve it.
- `src/main.ts`: replace the single `const cwd = process.cwd();` at `main.ts:120` with `const cwd = args.here ?? process.cwd();`, so every downstream call that already takes `cwd` (`initAgentStateDirectory`, `initDbDir`, `initProfileDir`, `initWorkspaceDir`, `TranscriptLogger`, `TranscriptStore`, `loadConfig`, `loadGithubToken`, `openApp`) picks up the override with no further changes. Do **not** change the `initGlobalHistory()` call — it takes no `cwd` argument today and must keep reading `~/.janissary/history.json` regardless of `--here` (decision 4).
- `src/cli-args.ts`: add `--here=<dir>    Run against a different directory instead of the current one` to `usageText()` (`cli-args.ts:54-69`), next to the existing `--port` line.

### 3. Specs

- `specs/cli.md`: add a `--here=<dir>` row to the flags table (`cli.md:5-13`); insert a new step 1 in the numbered startup sequence (`cli.md:36-47`) for lock acquisition, renumbering the existing 8 steps to 2-9; add a new "Startup failures" bullet (`cli.md:27-34`) for the same-directory-lock case, matching the existing `EADDRINUSE` bullet's format.
- `specs/state-directory.md`: add a sentence noting that concurrent `janus` processes are only safe against distinct directories, and that a PID lock file (`.janissary/lock`) prevents two processes from sharing one.
- Do not add a new `specs/multiple-instances.md` — the behavior is small enough to fold into the existing `cli.md` and `state-directory.md`, matching how `--relaunch` (a comparably-sized flag) is documented across `cli.md` and `specs/relaunch.md` rather than getting its own top-level "multi-launch" doc. If reviewers prefer a dedicated doc, `specs/relaunch.md` is the size/shape precedent to follow.

### 4. Tests (colocated, run via `./scripts/run.mjs check-diff`)

- `src/instance-lock.test.ts`: use a fresh `mkdtempSync(path.join(tmpdir(), 'instance-lock-test-'))` per test, matching the pattern in `src/workspace.test.ts:13`. Cover: `acquireLock` succeeds and writes `process.pid` when no lock file exists; a second `acquireLock` call against the same directory (still within the same test process, so the PID is provably alive) throws; `acquireLock` succeeds when the lock file contains a PID that is not alive — use a clearly-invalid/never-assigned PID such as `999999` rather than spawning and killing a real process; `releaseLock` removes a lock file whose PID matches `process.pid`; `releaseLock` leaves a lock file untouched when its PID does not match `process.pid` (simulating a failed-acquire release).
- `src/cli-args.test.ts`: add cases alongside the existing `--port` tests (`cli-args.test.ts:24-31`) — parses `--here=<existing-dir>` to the resolved absolute path, throws `CliUsageError` for a nonexistent path, throws `CliUsageError` for a path that exists but is a file, not a directory.
- No new `main.test.ts` is proposed — `main.ts`'s `boot()` has process-level side effects (spawning a browser, registering signal handlers) with no existing colocated test file, so it is not a precedent to extend here. The lock and flag-resolution logic being introduced is fully covered by the two unit-test files above; wiring inside `boot()` itself is exercised manually (see Verification).

## Out of scope

- Any UI change. `--here` and the lock are CLI/server-only.
- Discovering or listing other running instances (e.g. a `janus --list` command).
- Cross-instance communication or shared state beyond the existing shared global history.
- Changing `--relaunch` semantics; the lock applies identically whether or not `--relaunch` is passed.
- Windows-specific process-liveness edge cases beyond what `process.kill(pid, 0)` already provides (Node documents this as cross-platform, including Windows).

## Implementation order

1. `src/instance-lock.ts` + tests.
2. Wire `acquireLock`/`releaseLock` into `src/main.ts`'s `boot()` and exit handler.
3. `--here` flag in `src/cli-args.ts` (parsing, validation, usage text) + tests.
4. Wire `args.here` into `src/main.ts`'s `cwd` resolution.
5. Specs: `cli.md` and `state-directory.md` amendments.
6. Public documentation, if `public-documentation/` documents CLI flags (check for an existing `--port`/`--relaunch` entry there and mirror it).

Run `./scripts/run.mjs check-diff` after each step so typecheck/tests stay green incrementally.

## Verification

- `./scripts/run.mjs check-diff` after each implementation step (per CLAUDE.md, this is the AI development loop — do not run the full `npm run check`).
- Manual end-to-end check: run `janus` in one terminal from directory A, leave it running; in a second terminal run `janus --here=<A>` (the same directory) and confirm it fails fast with the lock error instead of clearing A's state out from under the first instance. Then run `janus --here=<B>` for a different directory B and confirm it starts normally, on its own auto-selected port, with its own `.janissary/` tree, while the first instance keeps running unaffected. Quit both and confirm `.janissary/lock` is removed from both A and B.
