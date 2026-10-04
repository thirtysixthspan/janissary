# Refuse a `spawnTerminal` working directory outside the project root

**Complexity: 3/10** — one guard on one host method, one comment correction, one sentence in three places that describe the resource.

**Goal.** `TabManager.spawnTerminal` passes `options.cwd` straight to `PseudoterminalManager.spawn`. A plugin that declares `spawnTerminal` can therefore start a fully interactive, unconfined zsh in `~/.ssh` or `/etc` and read and write through it over the pty channel the host already carries — in the very resources object whose `registerFile` and whose `openInEditor` capability both refuse a path outside `launchDir`.

**Approach.** `isInsideRoot` in `src/plugins/files.ts` is already the boundary this host applies to the two file-shaped resources, the plugin import boundary in `eslint.plugin-boundaries.mjs` already lets a plugin's server module reach it, and `launchDir` is the field `openInEditor` measures against. So the check is one call against the same helper on the same field, in the same host object, and there is no second rule to state.

The refusal throws, matching `declaredResources` in `src/plugins/context.ts`: a plugin author gets the reason rather than a terminal that quietly is not there. `withResources` in `src/tab/openers.ts` already turns a throwing factory into a killed terminal and no tab, and here the throw precedes any spawn, so there is nothing to kill — no tab opens and no process starts, which is the outcome that matters. The message names both paths, so the author can see what was refused and what was allowed.

**Checked, and left as it falls.** The bundled shell plugin's own two directories both survive: the project root, and a workspace clone under `.janissary/workspace/`, which is inside `launchDir`. The remote case changes shape rather than outcome — `originTab` reports a remote tab's `cwd` as the path on the *remote* host, which this root does not contain, so `zsh` typed in a remote agent tab is now refused by name. It already failed: `node-pty` throws `ENOENT` on a directory that does not exist locally, `withResources` rethrows, and no tab opens. Same outcome, stated reason. `product/specs/shell-tab.md` gains the sentence.

## Implementation

1. Guard `TabManager.spawnTerminal` in `src/tab/manager.ts` with `isInsideRoot(this.launchDir, options.cwd)`, before anything is spawned.
2. Correct the `cwd` comment on `TabPluginTerminalOptions` in `src/plugins/api.ts` — it currently says only "Where the terminal starts" — and the `spawnTerminal` resource's own comment beside it, so the bound is stated where a plugin author reads it.

## Tests

In `src/tab/manager.test.ts`, beside the existing `spawnTerminal` argv case: a `cwd` outside the launch root is refused and starts nothing, and one inside it still spawns. The suite's `makeTabManagerWithManagers` passes `/repo` as the project directory so the fixture's own `cwd` is inside the root and every existing `spawnTerminal` case keeps the value it asserts on.

`src/plugins/shell/activate.test.ts` keeps passing untouched: it stubs the resource object, so the bound in the host is not on its path.

## Documentation

- `documentation/developer-documentation/tab-plugins.md`: the `spawnTerminal` row of the declaration table, and the v1 changelog bullet for the resource.
- `product/specs/tab-plugins.md`, bundled shell plugin section: what the bound is and what a remote tab gets.
- `product/specs/shell-tab.md`, "Where the shell starts": a remote agent tab has no local directory for the shell to start in.

## Out of scope

- Confining a terminal that *is* inside the root. That is what the `workspace` option is for, and it is opt-in, so a shell inside the root is still an unconfined shell by design.
- `shell` and `args`. A plugin may name the program it starts; the boundary is the directory, and the reviewer's own earlier plan left naming a program alone for the same reason.
- Refusing a remote tab's `cwd` some other way — falling back to the local root would silently open a shell in the wrong directory, which is worse than a refusal.