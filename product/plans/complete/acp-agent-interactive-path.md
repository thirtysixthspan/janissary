# Find the ACP agent on the user's interactive shell PATH

**Complexity: 3/10** — one small new module and a two-line change at the single spawn point every ACP consumer shares (`connectAcp`). The only care needed is the blocking shell lookup, which is bounded, cached, and taken only when the ordinary PATH misses.

## Bug

The `acp` command fails to start with `ACP: failed to start ACP agent: spawn opencode ENOENT`. opencode is installed and runs from the user's terminal, but the executing shell (the server's environment) is not interactive, so it cannot find it.

## Root cause

`connectAcp` in `src/acp/index.ts` spawns the agent command (`opencode acp`) directly with `child_process.spawn`, so the binary is looked up only on the server process's own `PATH`. Harness tabs run their binaries through `$SHELL -i -c` (`shellCommandArgs` in `src/shell/startup.ts`), precisely because a version manager such as nvm adds its `bin` directory in the interactive rc file (`.zshrc`/`.bashrc`). A server whose environment never ran that rc file (a launcher, a tab shell started with `--no-rcs`) therefore lacks the directory, and an nvm-installed opencode is not found, even though the same binary launches fine as a harness.

## Correct behavior

An ACP agent given as a bare command name is found the way the user's terminal finds it: on the server's `PATH` when it is there, otherwise on the `PATH` the user's interactive shell sets up. A command nobody can resolve still fails with the existing `failed to start ACP agent` error.

## Reproduction

On this machine opencode is installed at `~/.nvm/versions/node/v24.19.0/bin/opencode`, a directory only `.zshrc` (nvm) adds to `PATH`.

- `env PATH=/usr/bin:/bin <node> -e "require('child_process').spawn('opencode',['acp']).on('error',e=>console.log(e.message))"` prints `spawn opencode ENOENT`, the exact error from the report.
- `env PATH=/usr/bin:/bin /bin/zsh -i -c 'command -v opencode'` prints `~/.nvm/versions/node/v24.19.0/bin/opencode`: the interactive shell finds it.
- Live: a scratch instance started with nvm stripped from `PATH` answers `acp <prompt>` with `ACP: failed to start ACP agent: spawn opencode ENOENT`.
- A new `connectAcp` test that launches a bare agent command found only on a stand-in user shell's PATH, with `env.PATH=/usr/bin:/bin`, fails with `ACP connection closed` (the spawn's ENOENT) against the unfixed code.

## Approach

Add `src/acp/command-path.ts` exporting `locateAcpCommand(command, env)`:

- A command containing `/`, or one the given `env.PATH` already resolves to an executable file, is returned unchanged with the same env, so the existing behavior and cost are untouched.
- Otherwise, ask `$SHELL` for its `PATH` once, through `shellCommandArgs` (interactive, non-login, the harness form), printing it between markers so rc-file banners are ignored. stdin is `/dev/null`, stderr is discarded, and a 10 s timeout bounds it. The answer is cached per shell for the process lifetime, failures included.
- If that `PATH` resolves the command, return the absolute path, plus the env with `PATH` replaced by the shell's, so anything the agent runs in turn (an nvm `node` behind a `#!/usr/bin/env node` shebang) is found too.
- If nothing resolves it, return it unchanged so the spawn reports ENOENT as before.

`connectAcp` calls it on the merged base env before `sandboxSpawn`. An absolute command also lets the sandbox's self-binary carve-in (`resolveExecutableDirs`) find the binary's directory. All ACP consumers (the `acp` command, agent execute, monitors, conversations, remote serve) share the fix.

## Implementation steps

1. Write the failing regression test in `src/acp/index.test.ts` and watch it fail.
2. Add `src/acp/command-path.ts` with `locateAcpCommand`, plus unit tests in `src/acp/command-path.test.ts`.
3. Call `locateAcpCommand` from `connectAcp` in `src/acp/index.ts`.
4. Update `product/specs/acp.md` and `documentation/user-documentation/advanced-agents/acp-agent.md`, where they say opencode must be "on PATH".

## Regression test

`src/acp/index.test.ts` › `connectAcp — an agent only the user's shell can find` › `starts a bare agent command found on the user's interactive shell PATH`. It installs the stub ACP agent as an executable in a directory that only a stand-in `$SHELL` adds to `PATH`, connects with `command: 'stub-acp-agent'` and `env.PATH=/usr/bin:/bin`, and expects a normal streamed reply with no connection errors. `src/acp/command-path.test.ts` covers the unchanged path and already-on-PATH cases, a banner-printing rc file, and an unresolvable name.

## Verification

- `$janissary/scripts/run.mjs check-diff` passes; the regression test fails without the fix and passes with it.
- Live check: start a scratch instance with `PATH=/usr/bin:/bin:/usr/sbin:/sbin` (no nvm) and a scratch `HOME` whose `.zshrc` adds the nvm bin directory, as the user's rc file does. A driver types `acp Reply with the single word pong.` into the shell tab and reads the ACP panel. Against the unfixed build it shows `ACP: failed to start ACP agent: spawn opencode ENOENT`. With the fix, opencode starts and replies `pong`.

## Out of scope

- Running the ACP agent itself through an interactive shell (an rc file printing to stdout would corrupt the ACP stdio transport).
- Changing how harness tabs or tab shells resolve binaries.
- A setting for an explicit opencode path.
