# Preserve a plugin's zsh startup directory when the host installs hooks

**Complexity: 2/10** — the host already merges the hook environment over plugin-provided variables; it needs to use a plugin's configured `ZDOTDIR` as the saved user value, with the host process value as fallback. One focused test and a short spec update pin the behavior.

## Goal

When a plugin starts zsh with `zshHooks` and supplies `env.ZDOTDIR`, preserve that directory for the user's startup files while keeping the host-owned directory as zsh's temporary `ZDOTDIR` during hook installation.

## Approach

`terminalEnvironment` in `src/tab/plugin-terminals.ts` currently passes `process.env.ZDOTDIR` to `shellStartupEnvironment`, even when the plugin's `env` contains its own `ZDOTDIR`. Select the plugin value when it is present and fall back to the process value otherwise. The startup helper will continue to override `ZDOTDIR` with its private directory and carry the selected user value in `JANUS_USER_ZDOTDIR`.

## Implementation steps

1. Update `terminalEnvironment` to pass `options.env?.ZDOTDIR ?? process.env.ZDOTDIR` to `shellStartupEnvironment`.
2. Add a test in `src/tab/plugin-terminals.test.ts` proving a supplied `env.ZDOTDIR` is saved in `JANUS_USER_ZDOTDIR` and the host directory remains in `ZDOTDIR`. Also verify the process value is used when the plugin does not supply one.
3. Update `product/specs/tab-plugins.md` to describe how the host restores the selected user `ZDOTDIR` for zsh startup files.

## Tests

Run `./scripts/run.mjs check-diff` after implementation and test changes. The new test covers both the plugin override and the process-environment fallback.

## Out of scope

- Changing how `shellStartupEnvironment` installs hooks or manages the temporary directory.
- Changing terminal options when `zshHooks` is absent.
- Updating public user documentation, which does not describe plugin terminal environment configuration.
