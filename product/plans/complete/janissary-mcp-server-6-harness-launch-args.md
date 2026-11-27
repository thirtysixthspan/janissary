# feat: build per-harness MCP launch arguments

**Complexity: 4/10** — ~100 added lines, 2 edited files, 4 requirements, 7 scenarios (p=4.97)

## Goal

Add the server-name and environment-reference launch fragment for claude, codex and opencode, plus the `--no-mcp` flag in the harness command parser. The fragment names only environment variables, never a literal token, so the same command string works locally and on a remote host where the URL names that host's port. This subplan changes no process environment and starts no server; it only makes the command and its parser ready.

Source: `./product/plans/complete/janissary-mcp-server.md`. Depends on no earlier subplan.

## Requirements

1. Every harness launch receives the server's connection and authentication details — feature text: "the server should expose its connection and authentication details to all harnesses so that when run they have access to the available commands." This requirement is shared with `janissary-mcp-server-7-harness-spawn-env.md`, which supplies the actual variable values.
2. Each harness lists the server under the name `janissary` — user answer: "Server name `janissary`".
3. A `harness … --no-mcp` launch receives no MCP flags and no MCP environment variables — user scope extra: "`--no-mcp` launch flag". This requirement is shared with `janissary-mcp-server-7-harness-spawn-env.md`, which makes the effective flag false at spawn.
4. A harness launched with `--offline` receives no MCP flags and no MCP environment variables — user answer: "No MCP config at all". This requirement is shared with `janissary-mcp-server-7-harness-spawn-env.md`.

## Design decisions

- Each harness is pointed at the server per launch, without writing the user's own harness config, and reads the bearer token from an environment variable rather than argv: claude through `--mcp-config` inline JSON with `${VAR}` expansion (no `--strict-mcp-config`, which would drop the user's own servers), codex through per-server dotted `-c mcp_servers.janissary.*` keys (never a whole-table override), and opencode through its inline config layer, verified against the installed 2.x binary.
- Each harness's MCP tool timeout is raised per server at launch so a question waiting on a human is not abandoned: claude gets a 7-day server `timeout`, codex `tool_timeout_sec=604800`, opencode a 7-day `timeout.execution`. These are launch settings alone, so the server needs no progress-heartbeat code.
- The token reference is always single-quoted with `shellQuote` (as `effortArg` does at `src/harness/index.ts:19`), so the launching shell leaves it unexpanded for the harness to read from its own environment and the token never appears in argv. The URL is not secret and differs per host: where a harness does not expand environment references in its URL itself (codex's `-c mcp_servers.janissary.url`), the fragment double-quotes `$JANISSARY_MCP_URL` for the launching shell to expand from the spawn environment on the host that runs it.
- `--no-mcp` follows the same shape as `--no-browser`: a boolean defaulting to true that the flag turns false, winning if both forms were present.
- For claude, the fragment's idle-abort and auto-background settings are switched off in the spawn environment by a later subplan, so no progress-heartbeat code is needed here either.

## Preserved behavior

None found. (The claude environment overrides are preserved in `janissary-mcp-server-7-harness-spawn-env.md`, where `harnessSpawnEnv` is edited.)

## Assumptions

1. Supported harnesses are claude, opencode and codex — `product/specs/harness.md:13` `harness <claude|opencode|codex>`.
2. A remote harness's launch command is built locally and shipped in the `spawn` frame, while its environment is built on the far side — `src/harness/tab-spawn.ts:85` `const command = buildHarnessCommand(name, model, effort);` and `src/remote/serve-processes.ts:109` `harnessSpawnEnv({`.
3. `shellQuote` is the existing helper for single-quoting a value in a launch command — `src/harness/index.ts:19` `--effort ${shellQuote(effort)}`.
4. `--no-browser` establishes the boolean-flag shape `--no-mcp` copies — `src/harness/command-parse.ts:121` `const browser = tokens.every(`.
5. The token variable name avoids the `ANTHROPIC_*` prefix claude blanks in headers — source plan design decision, grounded in https://github.com/pingdotgg/t3code/issues/15828.

## Existing functionality

1. Harness launch command builder with per-harness launch args — `src/harness/index.ts:45` `buildHarnessCommand`.
2. `shellQuote` for single-quoted values in that command — `src/harness/index.ts:19` `effortArg`.
3. Harness command parsing, split into pure flag parsing — `src/harness/command-parse.ts:110` `function parseHarnessFlags(`.
4. The launch-flag record handed from the parser to the manager — `src/harness/command-parse.ts:14` `export type HarnessLaunch =`.

## Implementation steps

1. In `src/harness/command-parse.ts`, add a `mcp` boolean to `HarnessLaunch` and to `parseHarnessFlags`' return value, computed beside `browser` at `src/harness/command-parse.ts:121` as `tokens.every(t => t.toLowerCase() !== '--no-mcp')`. Extend the parser doc comment with `--no-mcp`, winning if both it and any positive form were present. The file is already structured as pure parsing, so this adds no I/O. Build and check with `$janissary/scripts/run.mjs check-diff`.
2. Create `src/harness/mcp-args.ts` with a pure builder that returns the per-harness fragment from the server name `janissary` and the variable names, never a literal token: claude gets `--mcp-config` inline JSON with a `type: "http"` server whose `url` is `${JANISSARY_MCP_URL}`, an `Authorization: Bearer ${JANISSARY_MCP_TOKEN}` header and a 7-day `timeout`, and never `--strict-mcp-config`; codex gets `-c mcp_servers.janissary.url`, `-c mcp_servers.janissary.bearer_token_env_var="JANISSARY_MCP_TOKEN"` and `-c mcp_servers.janissary.tool_timeout_sec=604800`; opencode gets its inline config layer with `{env:JANISSARY_MCP_TOKEN}` in the header, `oauth: false` and a 7-day `timeout.execution`, checked against the installed 2.x binary's help and docs at implementation time. Build and check with `$janissary/scripts/run.mjs check-diff`.
3. Give `buildHarnessCommand` (`src/harness/index.ts:45`) an optional `mcp` argument and append the fragment when it is true. Single-quote the token reference with `shellQuote`; double-quote `$JANISSARY_MCP_URL` only in the codex URL override so the launching shell expands it. Update `product/specs/harness.md` line 13's command grammar with `--no-mcp`. No caller supplies the new argument yet, so existing launches are byte-for-byte unchanged. Build and check with `$janissary/scripts/run.mjs check-diff`.

Every touched file stays under the 200-line `max-lines` limit: `command-parse.ts` needs no extraction, and `mcp-args.ts` is a new focused module. Relative imports in `src/` carry the `.js` extension per NodeNext.

## UI design

1. This subplan adds no visual surface; its only user-visible effect is the accepted `harness … --no-mcp` grammar. The New harness dialog checkbox is `janissary-mcp-server-9-harness-dialog.md`.

## Tests

- `src/harness/command-parse.test.ts`: `--no-mcp` gives `mcp: false`, an absent flag gives `mcp: true`, and `--offline` still gives `mcp: true` here because the effective-mcp rule is applied at spawn (requirements 3, 4).
- `src/harness/mcp-args.test.ts`: the fragment for each of claude, codex and opencode names `janissary`, carries no literal token, carries the timeout, and never contains `--strict-mcp-config` (requirements 1, 2).

## Out of scope

- Environment variables and their values: `janissary-mcp-server-7-harness-spawn-env.md`.
- The New harness dialog toggle and the `--no-mcp` string it builds: `janissary-mcp-server-9-harness-dialog.md`.
- Changing any harness's existing launch arguments beyond appending the MCP fragment.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then call `buildHarnessCommand` for each harness with `mcp: true` and read the emitted string: it must name `janissary`, contain a token *variable reference* and never a token value, and contain no `--strict-mcp-config`. A failure is a literal token in argv or a server name other than `janissary`.
