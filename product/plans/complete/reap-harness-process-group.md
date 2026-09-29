# End a harness's whole process group with its tab

**Complexity: 4/10** — one small module that signals a process group with a grace period, wired into the two places a local PTY ends (`kill` and the exit handler). The risk is in the guards, not the size: a bad process-group id can signal janus itself or every process the user owns.

## Goal

The backlog item asks for two things: launch codex without its background server where possible, and otherwise make sure every process a harness started is gone once its tab is closed or its harness ends.

The first half already shipped. Codex 0.157 added a shared background server, and every codex launch now probes `codex --help` for `--no-daemon` and passes it when offered (`LAUNCH_ARGS` in `src/harness/index.ts`, spec "Launching with a model and effort level" in `harness.md`). The installed codex here is 0.157.0 and lists the flag. So this plan is about the second half.

## What happens today

A local PTY is ended by `node-pty`'s `kill()`, which sends SIGHUP to the PTY's own process and nothing else. A probe with a real PTY and the launch shell confirmed three things:

1. The launch shell execs the command, so the harness binary is the PTY's process. Because `node-pty` starts it in a new session, its pid is also its process group id.
2. Everything the harness forks — MCP servers, helper processes, shell commands it runs, a dev server it backgrounds — inherits that process group.
3. A process that ignores SIGHUP survives `kill()`, and so does anything the harness forked once the harness exits on its own. Those orphans hold ports, files, and CPU after the tab is gone.

## Approach

A new `src/pty-reap.ts` exports `reapProcessGroup(pgid)`. It sends SIGTERM to the whole group (`kill(-pgid)`) and, if anything was there to receive it, sends SIGKILL to the group after a short grace (`PTY_REAP_GRACE_MS`, 2 seconds) on an unref'd timer, so it never holds the server open. A group that is already empty makes the first signal fail with ESRCH, and nothing further happens.

`spawnPty` (`src/pty.ts`) reaps the group once, from whichever comes first:

- `kill()`, after the existing SIGHUP, which covers closing the tab, `connection close terminal:…`, and app shutdown;
- the PTY's exit, which covers the harness quitting or crashing on its own and leaving children behind.

Because this lives in `spawnPty`, it applies to every local PTY: harness tabs, ssh tabs, inline terminal cards, and the processes a remote janus spawns on its own host. That is deliberate. Every one of them is a program the tab owns, and architecture principle 6 asks for a release that matches the acquire. A PTY-backed agent shell is unaffected in practice: its interactive jobs run in their own process groups under job control, so only the shell's own group is signalled.

## Guards

`kill(0)` signals janus's own process group and `kill(-1)` signals every process the user owns. `reapProcessGroup` refuses any id that is not an integer greater than 1, and refuses the server's own pid. The signal function is injectable so unit tests never send a real signal.

## What it cannot reach

A process that leaves the group on purpose — `setsid`, a double-forked daemon — is out of reach by design. That is the case codex's shared server was, and `--no-daemon` is what prevents it. Tracking such processes would mean scanning the process table for descendants or environment markers, which needs `ps` (setuid, refused inside the sandbox) and is fragile across platforms. Out of scope.

## Implementation steps

1. Add `src/pty-reap.ts` with `reapProcessGroup` and `PTY_REAP_GRACE_MS`.
2. Wire it into `spawnPty`'s `kill` and `onExit`, reaping at most once.

## Tests

- `src/pty-reap.test.ts` (unit, injected signal function, fake timers): SIGTERM goes to `-pgid`; SIGKILL follows after the grace; no SIGKILL when the group was already empty; no signal at all for `undefined`, `0`, `1`, a negative id, a non-integer, or the server's own pid.
- `src/pty-reap.test.ts` (real PTY): a PTY whose program ignores SIGHUP exits promptly after `kill()`. Before this change it would run until its own timeout. The program is exec'd so it is the PTY's direct child, which is the only case this repo's own sandboxed test runs are allowed to signal.
- `src/pty.test.ts`: with the reaper mocked, `kill()` reaps the PTY's pid, exit reaps it, and both together reap only once.

## Spec and docs

- `product/specs/harness.md` "Lifecycle": closing a harness tab or the harness exiting ends every process in its process group, SIGTERM then SIGKILL after a grace, and the exception for processes that leave the group.
- `product/specs/shell.md` line on `close` killing the PTY, if its wording ("SIGTERM") needs to reflect the group.
- User docs: only if a page already describes what closing a harness tab does to its processes.

## Out of scope

- Finding processes that detached into their own session.
- Remote processes' teardown protocol, which the remote server already owns; its PTYs get the same reaping because they go through `spawnPty` on that host.
