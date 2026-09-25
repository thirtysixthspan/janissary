# Launch codex harness tabs without the shared background server

**Complexity: 3/10** — one launch-string change in the harness command builder, guarded so it cannot break an older codex, plus tests and spec prose. No sandbox profile change.

A workspaced codex harness tab fails to start on codex 0.157:

```
Error: failed to record pid-managed app-server process 82957 startup: failed to invoke ps for pid-managed app server: Operation not permitted (os error 1)
To work without the background server, rerun the same command with --no-daemon (including resume or fork and its arguments).
```

codex 0.157 made a shared, long-lived background app server the default for interactive sessions. The first TUI to start spawns it and records it by running `ps`; every later TUI connects to it over a Unix socket under `~/.codex` (`app-server-control`) and runs its session inside that server rather than in its own process.

## Why not give the sandbox access to `ps`

The issue asks for exactly that, and it is the wrong fix. The profile already allows `process-exec` everywhere outside `/tmp`, and `ps` still fails: `/bin/ps` is setuid root, and Seatbelt refuses to execute a setuid binary from inside a sandbox at all. The only profile construct that gets past that is `(allow process-exec (literal "/bin/ps") (with no-sandbox))`, which runs `ps` as root with no confinement. `ps eww -ax` then prints the full environment of every process on the machine — including the janissary server's own ambient `AWS_*`, `GITHUB_TOKEN`, and every other variable the environment scrub exists to keep out of a workspace. Today a sandboxed process can read the argument and environment blocks of only a small subset of the user's processes (walking `KERN_PROCARGS2` across every pid from inside a workspace returned 32), so this would be a new, machine-wide disclosure.

Even with `ps` working, the shared server is itself a hole in the workspace boundary. `~/.codex` is a write carve-out, so a sandboxed codex can reach the control socket of a server that an unsandboxed codex tab (or the user's own terminal) started, and would then run its whole session — tool calls included — in that unconfined process. It would also run with that other process's environment rather than its own, so a workspace's scoped `GH_TOKEN`, git identity, and `janissary` variable would not reach the commands it runs.

## Approach

**Launch every codex harness tab with `--no-daemon`.** The flag runs codex without the shared server "even if it is already running", which removes the `ps` call and the socket hand-off together. It applies to every codex harness tab, not only workspaced ones: a harness tab owns its process and closes it with the tab, and a session running inside another tab's server would carry that tab's environment and credentials either way. Remote tabs get it too, since the far side runs the same command string.

**Only when the installed codex understands it.** `--no-daemon` arrived with the daemon in 0.157; codex 0.156 and earlier reject an unknown flag and exit, which would close the freshly opened tab — the same failure `effortArg` already guards against for `--effort`. The harness command runs through the user's shell, so the command itself asks the binary: a command substitution runs `codex --help`, and emits `--no-daemon` only when the help text names it. The probe resolves the same `codex` the launch does, on whichever host the launch runs, so it needs no version table and no server-side detection. An empty substitution adds no argument in `sh`, `bash`, and `zsh` alike.

## Implementation steps

1. `src/harness/index.ts` — add a per-harness list of launch arguments that precede the model/effort flags, holding the `--no-daemon` probe for codex. Insert it right after the program in `buildHarnessCommand`. A comment above it records why the flag is needed (setuid `ps` under Seatbelt, the shared server as an escape from the workspace and from the tab's own environment) and why it is probed rather than passed outright. Update the `buildHarnessCommand` example comment.
2. `src/harness/index.test.ts` — update the two codex expectations to include the probe.

## Tests

In `src/harness/index.test.ts`:

- The existing codex string tests expect the probe right after `codex`, before `--model` and `-c`.
- claude and opencode commands are unchanged (the existing tests already pin them exactly).
- A new `describe` that runs the built codex command through each available shell (`/bin/sh`, `/bin/bash`, `/bin/zsh`) with a fake `codex` script first on `PATH`. The fake prints a configurable help text for `--help` and otherwise echoes its arguments one per line:
  - help text naming `--no-daemon` → the launch receives `--no-daemon --model gpt-5 -c model_reasoning_effort=high`;
  - help text without it (an older codex) → the launch receives only `--model gpt-5 -c model_reasoning_effort=high`, with no empty argument.

## Spec updates

- `product/specs/harness.md` — beside the effort-flag translation, state that codex is always launched without its shared background server when the installed version supports that, and why.
- `product/specs/sandbox.md` — under "IPC and system info", record that setuid binaries such as `ps` cannot run inside the sandbox and are deliberately not allowed, and that this is why codex runs without its shared server there.

## Out of scope

- **Any sandbox profile change**, including a `no-sandbox` exec rule for `ps` — see above.
- **A codex a user starts by hand** inside a workspaced tab's shell. It is not launched through `buildHarnessCommand`; it will hit the same error and codex's own message tells the user to add `--no-daemon`.
- **Disabling the daemon through codex configuration** (`features.daemon_auto_start=false`). It only stops auto-start; a codex that finds a server already running still attaches to it.

## Verification

Automated: `./scripts/run.mjs check-diff`.

Manual: on codex 0.157, open `harness codex -w` and confirm the TUI starts with no `pid-managed app-server` error; with an unsandboxed codex already running elsewhere, confirm the workspaced tab still starts its own session rather than attaching.
