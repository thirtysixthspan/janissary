# Launch opencode harness tabs with `--standalone`

**Complexity: 2/10** — one new entry in the harness launch-argument table that codex's `--no-daemon` probe already uses, plus tests and spec and documentation prose. No sandbox profile change.

opencode 2.x runs its interactive TUI against a shared background service by default. `opencode --help` lists `--standalone` as "Run with a private server instead of the background service". The background service has the same problems codex's shared server had (see [[codex-harness-no-daemon]]):

- It is a long-lived process outside the harness tab's process group, so closing the tab does not end it.
- A workspaced opencode would attach to a service that an unsandboxed opencode, or the user's own terminal, started. Its session and tool calls would then run in that unconfined process, with that process's environment and credentials instead of the tab's scoped ones.

## Approach

**Launch every opencode harness tab with `--standalone`.** This covers tabs with and without a workspace, and remote tabs, since the far side runs the same command string. Each tab then owns its own server and closes it with the tab.

**Only when the installed opencode understands it.** opencode rejects an unknown flag and exits (`Unrecognized flag: --standalone`), which would close the freshly opened tab. Releases before the background service do not have the flag. The command uses the same shell probe as codex: `$(opencode --help 2>/dev/null | grep -q -e --standalone && echo --standalone)`. It resolves the same `opencode` the launch does, on whichever host runs it, and expands to nothing when the flag is absent.

## Implementation steps

1. `src/harness/index.ts` — add the opencode probe to `LAUNCH_ARGS`. Broaden the comment above the table so it covers both harnesses' shared servers and the reason they are probed.
2. `src/harness/index.test.ts` — update the opencode string expectations to include the probe, and generalize the shell-run probe tests to cover opencode as well as codex.
3. `src/harness/manager.test.ts` — update the one spawn expectation that pins the full opencode launch string.

## Tests

In `src/harness/index.test.ts`:

- The existing opencode string tests expect the probe right after `opencode`, before `--model`. Effort is still dropped for opencode.
- claude commands are unchanged.
- The shell-run `describe` runs the built command for each of codex and opencode through each available shell (`/bin/sh`, `/bin/bash`, `/bin/zsh`), with a fake binary first on `PATH`:
  - help text naming the flag → the launch receives the flag first, then the model (and codex's effort override);
  - help text without it (an older release) → the launch receives only the model arguments, with no empty argument.

## Spec updates

- `product/specs/harness.md` — beside the codex paragraph under "Launching with a model and effort level", state that an opencode harness tab always runs with its own private server rather than opencode's background service when the installed version supports that, and why. Mention opencode's background service beside codex's in the "Ended with everything it started" bullet.

## Documentation updates

- `documentation/user-documentation/advanced-agents/harness.md` — extend the existing codex paragraph in "Workspaces" to opencode.

## Out of scope

- **opencode ACP launches** (`opencode acp`, used by conversations, personas, and monitors). The `acp` subcommand rejects `--standalone` (`Unrecognized flag: --standalone in command opencode acp`), so passing it would break every ACP connection.
- **An opencode a user starts by hand** inside a tab's shell. It is not launched through `buildHarnessCommand`.
- **Any sandbox profile change.**

## Verification

Automated: `$janissary/scripts/run.mjs check-diff`.

Manual: on opencode 2.x, open `harness opencode -w` and confirm the TUI starts and runs its own server, and that closing the tab leaves no opencode process behind.
