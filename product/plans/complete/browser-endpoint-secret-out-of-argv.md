# Plan: Keep the browser's internal path out of the process listing

**Complexity: 2/10** — one argument becomes one environment variable, and its parser reads it from there. It is a narrowing of who can reach the disclosure, not a fix for the underlying one; see `product/plans/deferred/browser-private-transport-boundary.md` for what remains.

## Goal

`spawnBrowserChild` passes the browser server's secret path as `--ws-path <token>` on the child's command line. On macOS, a process's argument vector is readable through `ps` by **any** user on the machine, not only the user that owns it. The token that is the sole credential for the browser's own endpoint is therefore printed to anyone with a shell on the host, alongside the port, which `--port` supplies on the same line.

Holding both is a complete bypass of the protocol guard: the client connects straight to the browser server and no frame is ever inspected. On a host without Seatbelt that reaches an unconfined browser.

This does not make the private hop private — the same secret is also served by Playwright's own unauthenticated `GET /json` to anything that can reach the port, which is the deferred plan's subject. What it does is stop the credential being broadcast to every account on the machine when a `-b` tab is open.

## Approach

Move the path from the argument vector to the child's environment.

`spawnBrowserChild` already builds the child's environment explicitly — it sets `TMPDIR` there — and that environment is constructed rather than inherited, so the browser allowlist in `paths.ts` does not filter it. The path becomes `JANISSARY_E2E_WS_PATH` in that object, and `--ws-path` leaves the argument list. `--port` and `--dir` stay on the command line: neither is a secret, and the port is discoverable by scanning regardless.

`parseE2EBrowserArgs` gains the environment as a second parameter and reads the path from it, keeping its existing shape — a clear `{ error }` on a malformed invocation rather than a usage string, since only `startE2EBrowserServer` ever spawns this.

**What this is worth, stated precisely.** Argument vectors are world-readable on macOS; environments are not. So the disclosure narrows from "any user on the host" to "the same user, through process inspection". It is not a boundary: the same user can still read `/proc/<pid>/environ` on Linux, and on any host the path is still served unauthenticated by the browser server itself. The comments say exactly this, so nobody later reads the change as having closed the finding.

## Implementation steps

1. `src/browser/e2e-child.ts` — `parseE2EBrowserArgs(argv, env)` reads `JANISSARY_E2E_WS_PATH` from `env` instead of `--ws-path` from `argv`; the error message names the variable.
2. `src/main.ts` — pass `process.env` at the call site.
3. `src/browser/e2e-server.ts` — drop `--ws-path` from the argument list and set the variable in the child's environment object.
4. Run `./scripts/run.mjs check-diff`.

## Tests

- `src/browser/e2e-child.test.ts` — the path is read from the environment; a missing variable is an error naming it; a `--ws-path` argument is *not* honoured, so the old channel cannot quietly keep working; `--port` and `--dir` still parse from argv.
- `src/browser/e2e-server.test.ts` — the token appears nowhere in the spawned argument vector, asserted against the whole joined command line rather than a named flag, and appears in the child's environment; the guard's upstream path and the environment variable are the same value.

## Spec and documentation

None. `product/specs/sandbox.md` says the browser's own address never leaves the Janissary process, which was already the intent and is not made true by this change — the deferred plan is where that claim gets reconciled. Adding a spec sentence here would overstate what was done.

## Out of scope

- Everything in `product/plans/deferred/browser-private-transport-boundary.md`: the unauthenticated `GET /json` disclosure, and the fact that a same-user process can defeat any secret passed to a child by any means.
- The `--port` and `--dir` arguments, neither of which is a credential.
