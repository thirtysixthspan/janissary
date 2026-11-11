# Export workspace path variables to harnesses
**Complexity: 4/10** — about 25 added production lines across 4 existing files, 6 requirements and 9 test scenarios (p=5.23).

Issue: $janissary, $root, $workspace should be set as variables in the workspace environment for harnesses to access.

## Goal

Shells, harness terminals, and ACP processes can expand `$janissary`, `$root`, and `$workspace` on the host where they run. `$janissary` identifies that host's running installation, `$root` identifies its project directory, and `$workspace` identifies the parent directory containing the project's workspace clones, matching the displayed `$workspace/<name>` paths.

## Approach

Move the project and workspace base state into `src/workspace/directories.ts`, with a small environment helper falling back to the process working directory before initialization. `src/workspace/index.ts` initializes and reads that same state, retaining its existing initialization guards. This extraction keeps environment setup independent of git provisioning and its process imports. Extend the existing installation environment helper in `src/sandbox/environment.ts` to include those paths. Reuse it in `src/sandbox/harness-spawn.ts` so confined and unconfined processes receive the same authoritative values, overriding stale inherited paths and preserving unrelated environment entries. Remote provisioning already initializes the workspace directories on its own host, so no protocol change is needed.

The shipped `.codex/config.toml` is source configuration copied by `janus init`. Its environment allowlist must preserve all three variables for commands a Codex harness executes; supplying them only to the harness process would leave the reported failure in place.

## Implementation steps

1. Add the workspace path environment helper and extend the shared spawn environment composition. Reuse it for confined harness launches. Update existing exact environment assertions to account for the added paths and run the diff checks.
2. Preserve `janissary`, `root`, and `workspace` in the shipped Codex environment filters. Add the regression tests below and run the diff checks.
3. Update `product/specs/root-path.md`, `product/specs/sandbox.md`, and the existing Codex environment description in `product/specs/workspaced-agent.md`. Correct the display-only claim in `documentation/user-documentation/getting-started/tabs.md`. Check command help for affected descriptions. The existing public workspace guide describes only token preservation, which remains accurate and needs no change. Complete the plan and remove only the resolved issue entry.

## Tests

- `src/sandbox/environment.test.ts`: default paths before workspace initialization; initialized project paths override stale inherited values while preserving unrelated entries; reinitialization for another host/project replaces earlier paths.
- `src/sandbox/index.test.ts`: an unconfined workspace gets all three variables; a non-workspaced spawn gets project paths too; a spawned shell expands paths containing spaces and resolves `$workspace/<name>` to the clone directory.
- `src/sandbox/harness-spawn.test.ts`: a confined launch gets all three authoritative values instead of stale inherited ones without dropping unrelated environment entries.
- `src/project/init.test.ts`: newly scaffolded and refreshed Codex configurations preserve all three variables (two cases).

## Out of scope

Changing sandbox filesystem permissions, adding application command path-prefix syntax, changing `$git-sync`, altering remote protocols, and fixing the separate shell transcript prompt issue. No new code comments are needed.
