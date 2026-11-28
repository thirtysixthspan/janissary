# Strip inherited MCP credentials from harness launches

**Complexity: 4/10** — Six existing production files, four requirements, and five test scenarios (p=5.00)

## Goal

Give each harness only the MCP credentials chosen for its own launch, even when Janissary runs inside a process that already has MCP configured.

## Requirements

1. “Strip inherited MCP URL, token and tab identity at the launch boundary” means a local harness with MCP disabled receives none of the three parent-process variables.
2. “Including for far-side harnesses” means a remote harness receives none of those parent-process or forwarded variables when its MCP is disabled.
3. “Before overlaying an explicitly configured endpoint” means an enabled harness receives the URL, token and tab identity assembled on the host running it.
4. “Keep unrelated env keys and the browser and Claude launch overrides” means only the three inherited MCP fields are stripped.

## Design decisions

- Mark local PTY starts that represent a harness at their call sites. The mark is not part of the remote protocol because the far side already knows whether its spawn frame names a harness.
- Remove the three variables from the ambient environment before confinement and from forwarded remote env before overlaying the local host's harness settings. Keep the injected values in the existing per-harness override.

## Preserved behavior

1. An enabled local launch still includes its MCP fragment and credentials. It never adds a token value to the command. The test “injects the three variables and the command fragment on a local launch” checks the launch decision.
2. A far-side launch mints its own token and publishes its own endpoint. It does not use the local host's credential. The test “mints its own token that matches nothing the spawn frame carried” checks the far-side overlay.
3. A plain no-browser, no-MCP OpenCode or Codex launch needs no explicit environment overlay. The test “returns undefined for %s, exactly as harnessEnv does” checks the overlay shape.

## Assumptions

1. Both host paths reach the same PTY spawn function. `src/harness/tab-spawn.ts:116` calls `this.managers.pty.spawn`, and `src/remote/serve-processes.ts:196` calls `spawnPty`.
2. The far side has enough information to distinguish a harness's forwarded environment. `src/remote/protocol-frames.ts:135` carries `harness?: string`.

## Existing functionality

1. `src/pty.ts:58` passes the process environment through `sandboxSpawn` before merging the caller's overrides for `pty.spawn`.
2. `src/harness/scratch-dir.ts:51` adds the host-selected MCP variables alongside the existing browser and Claude environment.

## Implementation steps

1. Share the MCP environment variable names and stripping operation. Mark actual harness PTY starts from `src/harness/tab-spawn.ts` and `src/remote/serve-processes.ts`, and carry the local mark through `src/pseudoterminal-manager.ts`. Have `src/pty.ts` strip the inherited variables before the sandbox branch runs. Strip those keys from forwarded remote harness values before the far-side overlay. Run `$janissary/scripts/run.mjs check-diff`.
2. Assert the effective environment passed to node-pty for local and far-side launches and update `product/specs/harness.md`. Run `$janissary/scripts/run.mjs check-diff`.

## UI design

1. The existing `--no-mcp` flag and **MCP server** checkbox continue to control whether the harness receives Janissary MCP credentials.

## Tests

1. For requirements 1 and 4, seed the parent environment with harmless MCP values and an unrelated variable. Start a local `--no-mcp` harness and check that the unrelated variable and existing Claude/browser overrides reach node-pty.
2. For requirements 2 and 4, start the far-side process with MCP disabled and both parent and forwarded fixture values. Check that the resulting PTY environment has no MCP variables and keeps an unrelated forwarded value.
3. For requirement 3, repeat the local and remote launches with MCP enabled. Check the effective PTY environment against the endpoint assigned on each host.

## Out of scope

Changes to the user's shell startup files, MCP endpoint configuration, browser isolation, or the remote protocol.

## Verification

1. Run `$janissary/scripts/run.mjs check-diff`.
2. Start Janissary with harmless parent values for `JANISSARY_MCP_URL`, `JANISSARY_MCP_TOKEN` and `JANISSARY_TAB`. Launch `harness claude --no-workspace --no-mcp`. Inspect the child environment for the presence of those variable names without printing any values. All three should be absent. Re-launch with MCP enabled and confirm the harness can use the active app's question tool.
