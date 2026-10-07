<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle the functionality gap where zsh hooks discard a plugin's configured `ZDOTDIR`.

Existing Issue: When a plugin supplies `env.ZDOTDIR` together with `zshHooks`, `terminalEnvironment` passes `process.env.ZDOTDIR` to `shellStartupEnvironment`, so zsh restores the host process's setting instead of the one the plugin configured. Severity: 5/10

Existing Risk: 4/10 - A plugin that uses a custom zsh startup directory silently reads a different startup configuration when it opts into host-installed hooks.

Proposal Risk: 2/10 - Choosing the plugin's `env.ZDOTDIR` when present and otherwise using `process.env.ZDOTDIR` preserves existing defaults while keeping the host startup directory in control during hook installation.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1574: handle the functionality gap where zsh hooks discard a plugin's configured ZDOTDIR". In `src/tab/plugin-terminals.ts`, pass `options.env?.ZDOTDIR ?? process.env.ZDOTDIR` as the user ZDOTDIR to `shellStartupEnvironment` when constructing the merged environment. Add a case to `src/tab/plugin-terminals.test.ts` that supplies both `env.ZDOTDIR` and `zshHooks`, then verifies the spawned environment sets `JANUS_USER_ZDOTDIR` to the supplied value while `ZDOTDIR` still points to the host startup directory. Retain a case proving the process environment remains the fallback. Update `product/specs/tab-plugins.md` to state that a supplied `env.ZDOTDIR` is restored for the user's startup files, then run the diff-scoped checks.
