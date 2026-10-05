# Record a new shell's actual starting directory

**Complexity: 3/10** — the host already sees the directory every plugin terminal is spawned in; the fix carries that value one step further, from `withResources` to the place that records the new tab's cwd, plus one test and one spec sentence.

## Goal

A new shell tab's recorded working directory is the directory its terminal actually started in, from the moment the tab exists. Today `openPluginTab` in `src/tab/openers.ts` records `source.runtime?.cwd`, while `openShellTab` in `src/plugins/shell/open-tab.ts` starts the terminal in the workspace clone or the project root whenever the source tab's directory is outside the allowed bound. After a shell `cd /tmp` and `Cmd+T`, the new shell runs at the project root while completion, **open file navigator here**, new shells and new agents use `/tmp` until zsh's first OSC 7 report, which never arrives for a shell no browser has mounted.

## Approach

`withResources` already wraps every `spawnTerminal` call a plugin factory makes, and it sees the `options.cwd` the host passes to `spawnPluginTerminal` (which refuses any directory outside the project root, so a recorded value is always one a terminal really started in). It will also report the directory of the first terminal it started, as `terminalCwd`. The first terminal is the tab's own: the shell factory starts exactly one, and the tab's single recorded directory can only describe one process.

`openPluginTab`'s `afterApply` then sets `tabRuntime(minted).cwd` from `terminalCwd` whenever the factory started a terminal, instead of from `source.runtime?.cwd`. The workspace and offline inheritance stays where it is, gated on there being a source tab. Recording the terminal's directory no longer depends on a source tab: a terminal that started somewhere has a known directory whether or not the tab that asked still exists.

`updatePluginTab` is unchanged. An update that starts a terminal on an existing tab does not replace the tab's shell, so it has no reason to move the recorded directory.

Rejected alternative: having the shell plugin call `recordCwd` from its factory. That capability records against the tab that ran an intent, and inside an open factory the new tab has no label yet, so the host is the only place that can attach the directory to the minted tab.

## Implementation steps

1. In `src/tab/openers.ts`, have `withResources` capture the `cwd` passed to the first `spawnTerminal` call and return it as `terminalCwd` alongside `terminalIds`.
2. In `openPluginTab`'s `afterApply`, set `tabRuntime(minted).cwd = terminalCwd` when the factory started a terminal, and keep the workspace and offline inheritance under the existing `source` check.
3. Update `product/specs/shell-tab.md` to say a new shell's recorded directory is the one its terminal started in, including when it fell back to the workspace clone or project root.

## Tests

In `src/tab/manager.test.ts`, beside the "retains the source workspace through shell and nested-shell lifetimes" case (whose workspace reference counting a third shell would disturb), add a case where a workspaced source's recorded cwd is `/tmp`, outside the root, and the factory spawns at the clone root: the new tab's `cwdOf` is the clone root, not `/tmp`, while it still inherits the workspace and offline mode. Add a second case where a source inside the root has cwd `/repo/a` and the factory spawns at `/repo` (the project-root fallback), asserting `/repo`. The existing case's assertion that the first shell records `/repo/clone/subdir` stays and now pins the value coming from the spawned terminal.

The existing shell-open tests in `src/plugins/shell/activate.test.ts` must keep passing.

## Out of scope

- Drift between the recorded directory and zsh's real one after a `cd`, which the OSC 7 report already corrects.
- Terminals started by `updatePluginTab`.
- User documentation, which does not describe the recorded directory of a new shell.
