# Spin Up Multiple Independent Instances of Janissary

## Summary

Make it easy to launch Janissary in a target directory such that each instance — server + UI — runs independently, bound to its own files, ports, and state. No two instances may share overlapping file trees or communication channels. A `janus --here` flag replaces the need for manual coordination between instances.

## Decisions (to be confirmed with user)

1. **Isolation model: per-directory server.** Each Janissary instance binds to its own `cwd`. The server reads/writes `.janissary/` in its own working directory. Port binding uses a dynamic allocation scheme — the first instance gets a default port (5173), subsequent instances get `5174`, `5175`, etc., with collision detection.
2. **Launch mechanism: `janus --here`.** `janus --here` starts a new Janissary server in the current directory, opens a browser window pointing at the allocated port. `janus` without `--here` behaves as today (opens or connects to the existing instance for the current directory's root). `janus --here <directory>` starts an instance in the specified directory.
3. **Port allocation: sequential + detective.** On startup, the server attempts to bind to `PORT_BASE + n` for `n = 0, 1, 2, …`. If the port is in use, increments and retries up to a limit of 10. The allocated port is written to a `.janissary/port` file so the `janus` CLI (when run from the same directory) can connect to the right instance.
4. **State isolation: fully independent.** Each instance has its own `.janissary/state/`, `.janissary/workspace/`, `.janissary/config.json`, `.janissary/transcripts/`. No sharing, no cross-instance communication. The user manages each instance independently.
5. **Overlap detection: reject overlapping roots.** If `janus --here /foo` is issued and an instance already running in `/foo` or `/foo/subdir` has a locked port, the new instance detects this (via the `.janissary/port` file comparison) and refuses to start. Similarly, an instance will not start inside a directory that is already an ancestor of another running instance's root.

## Verified codebase facts that shape the design

- **Server already binds to a configurable port.** `src/index.ts` starts the HTTP/WebSocket server. The port is currently determined by `JANUS_PORT` env var or defaults. Adding dynamic allocation is a startup-time change.
- **CLI entry point is `bin/janus.mjs`.** This script spawns the server and opens the browser. `--here` is a natural addition here.
- **`cli-args.test.ts` already tests parse behavior.** Adding `--here` and its variants follows the existing test pattern.
- **Process singleton pattern exists informally.** The `janus` CLI currently assumes one server per project root. Breaking this assumption cleanly requires the port file as a registry.
- **State directory is rooted at `cwd`.** `.janissary/` is a local directory. Each instance at a different `cwd` is naturally isolated. No code changes needed for state isolation — it's inherent in the current architecture.
- **`specs/startup.md` might have relevant documentation.** The startup flow is documented; it would need updating.

## Proposed changes

### 1. Port allocation

- New module `src/port-allocator.ts`:
  - `allocatePort(basePort: number = 5173, maxAttempts: number = 10): Promise<number>` — attempts to bind to `basePort + n` for n=0..maxAttempts. Returns the first free port, or throws if all are occupied.
  - `writePortFile(cwd: string, port: number): void` — writes `.janissary/port` containing the allocated port number.
  - `readPortFile(cwd: string): number | null` — reads `.janissary/port` if it exists.
- `src/index.ts` startup: before creating HTTP server, call `allocatePort()` instead of reading `JANUS_PORT` directly. Write the port file after successful bind.

### 2. Overlap detection

- New module `src/instance-guard.ts`:
  - `detectCollision(cwd: string): string | null` — walks up the directory tree from `cwd` to the filesystem root, checking each ancestor for a `.janissary/port` file. If found, attempts to connect to that port to verify the server is alive. Returns the conflicting directory path, or null if no collision.
  - Called at startup before server creation. If a collision is detected, the process exits with a clear error message: `Another janus instance is already running at /path/to/ancestor (port 5173). Use 'janus --here' from a directory outside that tree.`
  - Also checks child directories: if any descendant has a `.janissary/port` pointing to a live server, refuses to start (prevents a parent instance from shadowing a child).

### 3. CLI changes

- `bin/janus.mjs`: parse `--here [directory]` flag.
  - `--here` with no argument: start instance in `process.cwd()`.
  - `--here <path>`: start instance in resolved path.
  - Without `--here`: connect to existing instance (today's behavior). If no port file found, start an instance in the current directory (also today's behavior).
- `src/cli-args.ts` / `bin/janus.mjs`: add `--here` flag to the argument parser with an optional value.

### 4. Browser launch

- `bin/janus.mjs`: after server start, call `open(url)` or equivalent to open a browser window at the allocated port's address. This replaces the current assumption that the user opens the browser manually or that the instance connects to an existing session.
- Cross-platform: use a minimal helper that works on macOS (`open`), Linux (`xdg-open`), and Windows (`start`).

### 5. Cleanup

- On server shutdown (`SIGINT`, `SIGTERM`, normal exit), delete the `.janissary/port` file so the port is released for future instances.
- Register a `process.on('exit', ...)` handler in `src/index.ts`.
- If the server crashes (unhandled rejection, fatal error), the port file may linger. A startup-time check verifies the port is alive; if not, the stale file is removed and allocation proceeds.

### 6. Specs

- New `specs/multiple-instances.md`: port allocation strategy, overlap detection, `--here` flag, cleanup, process lifecycle.
- `specs/root-path.md` or `specs/state-directory.md`: cross-reference that multiple instances use separate state directories.
- `specs/application-commands.md` (or a new `specs/startup.md`): document `--here` flag.

### 7. Tests (colocated, run via `./scripts/run.mjs check-diff`)

- `src/port-allocator.test.ts`: allocation increments correctly, max-attempts exhaustion, port file write/read round-trip.
- `src/instance-guard.test.ts`: collision detection (ancestor with live port), child collision, no collision in dirty directory, stale port file cleanup.
- `src/cli-args.test.ts`: parsing `--here`, `--here <path>`, no `--here`.
- Integration test: start two instances in different directories, verify both respond on different ports, verify state files are independent, verify ancestor collision is rejected.

## Implementation order

1. Port allocator: `src/port-allocator.ts` + integration into `src/index.ts`, tests.
2. Overlap detection: `src/instance-guard.ts` + startup guard, tests.
3. CLI: `--here` flag in `bin/janus.mjs` / `src/cli-args.ts`, tests.
4. Browser launch: cross-platform `open` helper.
5. Cleanup: port file deletion on exit.
6. Specs: new `multiple-instances.md` + amendments to root-path, state-directory.
7. Public documentation.

Run `./scripts/run.mjs check-diff` after each step.
