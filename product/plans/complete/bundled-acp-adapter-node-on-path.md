# Make the server's node resolvable for bundled ACP adapters

**Complexity: 2/10** — ~12 added production lines in 1 file, 4 requirements, 6 test scenarios (p=4.30)

## Goal

A claude or codex role launch starts even when the Janissary server was started from a launcher whose `PATH` holds no `node`. Today `locateAcpCommand` (`src/acp/command-path.ts`) resolves a bundled adapter (`claude-agent-acp`, `codex-acp`) to its absolute path in the install's `node_modules/.bin` and returns the caller's environment unchanged. Both adapters' entry points start with `#!/usr/bin/env node`, so on such a server `/usr/bin/env` finds no `node` and every claude/codex role launch fails to start.

Before the bundled adapters, the role launch ran `npx`. On the same server `npx` was not on `PATH` either, so the interactive-shell fallback found it and handed the agent the shell's `PATH`, which made `node` resolvable for the shebang. The `.bin` hit skips that fallback. Subplan 1 (`product/plans/complete/deny-internal-tools-1-bundle-acp-adapters.md`) deferred "making `node` resolvable for the adapter's shebang" on the premise that `npx` had the same requirement; it did, but the fallback met it, and the `.bin` step does not.

## Design decisions

- The fix lives in the `.bin` branch of `locateAcpCommand` only. A command containing `/`, a name the given `PATH` resolves, and the interactive-shell fallback behave exactly as before, including returning the same `env` object where they did.
- The node to make resolvable is the one running the server: `path.dirname(process.execPath)`. It is known to exist and to run Janissary's own code, and on a remote host `locateAcpCommand` runs in `src/remote/serve-acp.ts`, so it names the remote's own node.
- On a `.bin` hit, when that directory is not already one of the entries of the given `PATH`, the returned env is a copy whose `PATH` is that directory followed by the original `PATH` (or just the directory when `PATH` is unset or empty). The rest of the environment is kept. When the directory is already on `PATH`, the env is returned unchanged, as the same object, so a server whose `PATH` already holds its node sees no change at all.
- Prepend rather than append: the server's PATH lacks this directory, so any `node` it does hold is not the one running Janissary, and the adapters need `node >=22`. Putting the server's node first guarantees the shebang runs a node known to work. Nothing else on `PATH` is removed or reordered.
- The adapters do not find their nested CLIs through `PATH` (claude-agent-acp resolves its Claude CLI with `createRequire`; codex-acp runs `@openai/codex/bin/codex.js` through `require.resolve`), so the prepended directory does not redirect them.
- Sandbox: confined spawns (`confinedHarnessSpawn` in `src/sandbox/harness-spawn.ts`) pass the env through `scrubEnv`, a denylist (`ENV_SCRUB_PATTERNS` in `src/sandbox/paths.ts`) that does not match `PATH`, so the rewritten `PATH` reaches the confined adapter. The server node's directory is already carved into the read allow-list in both literal and real forms (`SERVER_NODE_DIR_L`/`SERVER_NODE_DIR_R`), and the profile allows `process-exec`. No sandbox change is needed and no carve-in is widened.

## What already exists (reuse, don't rebuild)

| Existing | Where | Use |
| --- | --- | --- |
| Bundled lookup | `src/acp/command-path.ts` `locateAcpCommand` `.bin` branch | Gains the `PATH` adjustment on a hit. |
| Server node directory | `process.execPath`, as `serverNodeDirs` in `src/sandbox/harness-spawn.ts` uses it | Same source for the directory to prepend. |
| Test fixtures | `src/acp/command-path.test.ts` `installRootWith`, the mocked `janissaryRoot` | Reused; one helper variant writes a `#!/usr/bin/env node` script. |

## Implementation steps

1. `src/acp/command-path.ts`: add a module-private function that takes the env and returns it unchanged when `path.dirname(process.execPath)` is among the `:`-separated entries of `env.PATH`, and otherwise returns `{ ...env, PATH: <dir> }` or `{ ...env, PATH: '<dir>:<PATH>' }`. In `locateAcpCommand`, the `.bin` hit returns `{ command: bundled, env: <that function's result> }`. Update the header comment and the doc comment above `locateAcpCommand` to say a bundled adapter also gets the server's node on `PATH`, and why. The file stays far under the 200-line limit.

## Tests

`src/acp/command-path.test.ts`:

- The two existing bundled cases (`resolves a command the install bundles…`, `prefers the bundled copy…`) pass a `PATH` without the server's node directory; their env assertion changes from "same object" to: `PATH` is the node directory followed by the original `PATH`, other variables kept.
- A bundled hit whose `PATH` already holds the server's node directory (not first) returns the same env object.
- A bundled hit with no `PATH` gets `PATH` equal to the node directory alone.
- End to end: a bundled entry that is a `#!/usr/bin/env node` script, spawned with the returned command and env while the given `PATH` holds no `node`, runs and prints its output.
- The interactive-shell fallback case additionally asserts the server's node directory was not added when the shell's `PATH` lacks it — the non-`.bin` paths stay unchanged. The path-given, PATH-hit, and nothing-resolves cases keep their same-object assertions unmodified.

## Spec and docs updates

- `product/specs/acp.md` "Provider and model": after the sentence saying the adapters are found in the install's `node_modules/.bin`, add that a bundled adapter runs with the Node that runs Janissary put on its PATH when that PATH lacks it, so the adapter starts even when Janissary was launched without `node` on its PATH.
- `documentation/user-documentation/advanced-agents/acp-agent.md` already says the adapters ship with Janissary and need only the harness's sign-in; the fix makes that true on such a server, so no change.

## Out of scope

- Moving the server's node directory ahead of another `node` that the given `PATH` already lists before it; a `PATH` that names the server's node directory anywhere is left alone.
- Any change to the interactive-shell fallback, to persona/monitor/conversation launches through `npx`, or to sandbox profiles and env filtering.
- Windows `PATH` delimiter handling; the module already splits `PATH` on `:`.
