# feat: inject MCP variables into local harness spawn environments

**Complexity: 4/10** — ~80 added lines, 3 edited files, 6 requirements (p=5.23)

## Goal

Give harness processes their own tab label, MCP URL and token in the environment on the host where they run, and make the effective MCP decision in `tab-spawn.ts`: false for `--no-mcp`, `--offline`, or when the local server is not running. A remote launch ships no local MCP variables, just as it ships no local browser. This is where the connection details built earlier become reachable by a harness.

Source: `./product/plans/complete/janissary-mcp-server.md`. Depends on `janissary-mcp-server-5-local-server-manager.md` and `janissary-mcp-server-6-harness-launch-args.md`.

## Requirements

1. Every harness launch receives the server's connection and authentication details — feature text: "the server should expose its connection and authentication details to all harnesses so that when run they have access to the available commands." Shared with `janissary-mcp-server-6-harness-launch-args.md`, which builds the launch fragment.
2. Every harness launch receives its own tab's label in `JANISSARY_TAB` — user answer: "Env label + shared token".
3. Every harness launch receives the server URL in `JANISSARY_MCP_URL` and the token in `JANISSARY_MCP_TOKEN` — user answer: "janissary + JANISSARY_MCP_*".
4. A harness launched with `--offline` receives no MCP flags and no MCP environment variables — user answer: "No MCP config at all".
5. A `harness … --no-mcp` launch receives no MCP flags and no MCP environment variables — user scope extra: "`--no-mcp` launch flag".
6. A harness launched while the server is not running receives no MCP flags and no MCP environment variables — user answer: "Harnesses launched while it's down get no MCP flags or variables."

## Design decisions

- The URL and token variables are added in `harnessEnv`/`harnessSpawnEnv`, so a remote launch builds its own copy on the far side as the browser variables already do; the command fragment is built locally and names variables only.
- The token variable name avoids the `ANTHROPIC_*` prefix that claude blanks in headers.
- For claude, `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS=0` keeps a waiting call out of the background and `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT=0` stops the 5-minute idle abort. These are launch settings alone, so the server needs no progress-heartbeat code.
- The effective `mcp` is false when `--no-mcp` or `--offline` is present, or when `McpManager.localLaunch()` is undefined; this single rule applies locally and remotely.
- A remote tab sets `tab.mcp` but builds no local MCP variables, exactly as it builds no local browser; the far side supplies its own `{ url, token }`.

## Preserved behavior

1. A claude launch still carries `CLAUDE_CODE_TMPDIR` and `DISABLE_AUTOUPDATER`. Negative assertion: adding MCP variables must not drop or overwrite claude's existing overrides. Test: `src/harness/scratch-dir.test.ts` "returns claude's own overrides and no handle".

## Assumptions

1. Harness spawn environment is built on the host the harness runs on, local and remote — `src/harness/scratch-dir.ts:42` `harnessSpawnEnv`, called from `src/harness/tab-spawn.ts:91` and `src/remote/serve-processes.ts:109`.
2. A remote harness's launch command is built locally and shipped in the `spawn` frame, while its environment is built on the far side — `src/harness/tab-spawn.ts:85` `const command = buildHarnessCommand(name, model, effort);`.
3. The local manager exposes `localLaunch()` as `{ url, token }` or undefined — `src/mcp/manager.ts` (added by `janissary-mcp-server-5-local-server-manager.md`).
4. `tab.browser` is the precedent for a launch-time boolean kept on the tab — `src/tab/types.ts:440` `browser?: boolean;`.
5. `mcp` from the command parser is the opt-out flag this rule consumes — `src/harness/command-parse.ts:14` `export type HarnessLaunch =` (added by `janissary-mcp-server-6-harness-launch-args.md`).

## Existing functionality

1. Harness spawn environment built on the machine the harness runs on — `src/harness/scratch-dir.ts:42` `harnessSpawnEnv`.
2. Claude's own environment overrides — `src/harness/scratch-dir.ts:17` `harnessEnv(name: string, cwd: string)`.
3. The local tab spawn path that chooses local versus remote environment — `src/harness/tab-spawn.ts:89` `const spawnEnv = channel ? { env: undefined, handle: undefined } : harnessSpawnEnv({`.
4. The manager-local launch API — `src/mcp/manager.ts` `localLaunch()`.

## Implementation steps

1. Give `harnessSpawnEnv` (`src/harness/scratch-dir.ts:42`) an optional `mcp: { url, token }` option, plus the tab label it already receives. Merge it after the existing claude and browser variables, adding `JANISSARY_TAB`, `JANISSARY_MCP_URL` and `JANISSARY_MCP_TOKEN`; for claude also set `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS=0` and `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT=0`. With no `mcp` option, the result is byte-for-byte what it was before, which pins preserved behavior 1. Build and check with `$janissary/scripts/run.mjs check-diff`.
2. Add an optional `mcp?: boolean` field to `Tab` in `src/tab/types.ts` beside `browser` (`src/tab/types.ts:440`). In `HarnessTabSpawn.spawnTab` (`src/harness/tab-spawn.ts:45`), set `tab.mcp` from the effective MCP decision. In `finishSpawn`, pass the effective flag into `buildHarnessCommand` and, for a local launch, the `{ url, token }` from `managers.mcp.localLaunch()` into `harnessSpawnEnv`; a remote launch passes no local MCP variables. Build and check with `$janissary/scripts/run.mjs check-diff`.
3. Compute the effective flag once from `options.mcp`, `offline` and `localLaunch() !== undefined`, and use it for both the command fragment and the environment so they cannot disagree. Update `product/specs/harness.md` with the three injected variables and the two claude overrides. Build and check with `$janissary/scripts/run.mjs check-diff`.

Every touched file stays under the 200-line `max-lines` limit. Relative imports in `src/` carry the `.js` extension per NodeNext.

## UI design

1. No new visual surface here. The metadata flag that reads `tab.mcp` is `janissary-mcp-server-8-metadata-flag-and-focus.md`, and the dialog checkbox is `janissary-mcp-server-9-harness-dialog.md`.

## Tests

- `src/harness/scratch-dir.test.ts`: the three MCP variables are present with the `mcp` option and claude's two timeout overrides are set; they are absent without it; `CLAUDE_CODE_TMPDIR` and `DISABLE_AUTOUPDATER` survive unchanged (requirements 2, 3 and preserved behavior 1).
- `src/harness/tab-spawn.test.ts`: local `--no-mcp` and `--offline` launches pass no MCP variables and no fragment; a launch while `localLaunch()` is undefined does the same; a remote launch passes no local MCP variables (requirements 4, 5, 6).

## Out of scope

- Building the command fragment: `janissary-mcp-server-6-harness-launch-args.md`.
- The far-side endpoint and its own token: `janissary-mcp-server-12-far-side-endpoint.md`.
- The New harness dialog toggle.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then launch `harness claude as asker` with the server running and inspect the spawned process environment: `JANISSARY_TAB` is `asker`, and `JANISSARY_MCP_URL` and `JANISSARY_MCP_TOKEN` are present. Repeat with `--offline` and with `--no-mcp` and confirm all three are absent. A failure is a leaked token in argv or variables present while the server is down.
