# Pass the Claude Code subscription token to workspaced tabs

**Complexity: 3/10** — one new module mirroring an existing one, a second credential threaded through the sandbox options already carrying the first, three one-line call-site changes, and spec updates. No new architecture.

Janissary hands a workspaced tab its scoped GitHub credential by reading `.janissary/github-token` at startup (`src/github-token.ts`) and injecting `GH_TOKEN` into every workspaced spawn (`src/sandbox/index.ts`). A workspaced `claude` harness has no equivalent path to its own Anthropic credential. It gets one only by accident of the host: on macOS the sandbox carves in `Library/Keychains` reads (and, since the refreshed-token fix, a narrow `login.keychain-db` write), so the harness finds its OAuth credential where the unsandboxed CLI left it. Where there is no Keychain — Linux, a container, a non-darwin remote — the credential lives in `~/.claude/.credentials.json`, which `SECRET_DENY_PATHS` denies outright and deliberately. The harness starts, reports itself logged out, and the tab is useless.

The Claude Code CLI reads a long-lived subscription token from `CLAUDE_CODE_OAUTH_TOKEN` (confirmed against the installed binary, v2.1.241; the user mints one with `claude setup-token`). That is the same shape of solution the GitHub token already uses: a user-provisioned file in `.janissary/`, read once at startup, injected per workspaced spawn — so this fix follows that module for module rather than inventing a second mechanism.

## Approach

**Loading.** New module `src/claude-token.ts`, a direct mirror of `src/github-token.ts`: `loadClaudeToken(projectDir)` reads `.janissary/claude-token`, trims, caches in a module-level variable, and returns `undefined` when the file is missing or empty; `getClaudeToken()` reads the cache. Loaded once in `main.ts` next to `loadGithubToken`. Absent by default — no file, no injection, workspaces behave exactly as today.

**Injection.** `SandboxOptions` grows a `claudeToken?: string` alongside `githubToken`. `sandboxSpawn` sets `CLAUDE_CODE_OAUTH_TOKEN` from it on both paths — the confined path (after the scrub) and the unconfined pass-through — for the same reason `GH_TOKEN` is set on both: a workspace on a host that cannot confine anything still needs its credential. The two existing credential helpers in `sandbox/index.ts` generalize to cover both tokens rather than gaining a parallel pair.

**Not added to `ENV_SCRUB_PATTERNS`.** `CLAUDE_CODE_OAUTH_TOKEN` is an LLM provider credential, and the scrub list deliberately does not match those (`ANTHROPIC_*`, `OPENAI_*`, `GEMINI_*`/`GOOGLE_*` are all exempt, documented in `paths.ts` and `product/specs/sandbox.md`) — the harnesses need their own credentials to function. Scrubbing it would also break a user who exports the variable ambiently today and has no token file. So an ambient value passes through as it always has, and a configured `.janissary/claude-token` takes precedence over it. This is the one place the Claude token's treatment intentionally differs from `GH_TOKEN`'s, and the spec says so.

**Injected for any workspaced spawn, not just a `claude` harness** — matching `GH_TOKEN`, which is injected uniformly even though only `git`/`gh` consume it. An agent tab's plain shell can invoke `claude` just as a harness tab can, so gating on harness kind would leave that case broken while adding a branch at every call site.

## Implementation steps

1. `src/claude-token.ts` — new module: `loadClaudeToken`, `getClaudeToken`, module-level cache. Mirror `src/github-token.ts`'s structure and comment style.
2. `src/main.ts` — import and call `loadClaudeToken(cwd)` alongside the existing `loadGithubToken(cwd)`.
3. `src/sandbox/index.ts` — add `claudeToken?: string` to `SandboxOptions` with a comment explaining what consumes it. Generalize `githubCredentialEnv`/`withGithubCredentials` into a pair covering both credentials (`workspaceCredentialEnv`/`withWorkspaceCredentials`), keeping the existing `GH_TOKEN`/`GH_CONFIG_DIR` behavior byte-for-byte and returning the caller's own env object untouched when no token applies. Use it in both the confined and pass-through branches.
4. `src/shell-manager.ts` — pass `claudeToken: tab?.workspaceDir ? getClaudeToken() : undefined` next to the existing `githubToken` line.
5. `src/pseudoterminal-manager.ts` — same addition on the `spawnPty` sandbox options.
6. `src/acp/index.ts` — same addition on the `sandboxSpawn` options.
7. `product/specs/sandbox.md` — extend "Environment scrubbing" with the new variable and, explicitly, with why it is *not* on the scrub list while `GH_TOKEN` is.
8. `product/specs/workspaced-agent.md` — add a "Harness authentication" section covering the token file, what it fixes (a Keychain-less host), and that it is local-only today.

## Tests

- `src/claude-token.test.ts` (new, mirroring `src/github-token.test.ts`): returns the trimmed token when the file exists and caches it for `getClaudeToken`; returns `undefined` when the file is missing; returns `undefined` when the file is empty.
- `src/sandbox/index.test.ts` (extended):
  - injects `CLAUDE_CODE_OAUTH_TOKEN` on a confined workspaced spawn when `claudeToken` is given;
  - still injects it for a workspaced spawn when nothing is confined (the unconfined pass-through path);
  - does not set it when `claudeToken` is omitted and no workspace is involved;
  - leaves an ambient `CLAUDE_CODE_OAUTH_TOKEN` in place when `claudeToken` is omitted — the assertion that pins the deliberate decision to keep it off `ENV_SCRUB_PATTERNS`;
  - a configured `claudeToken` overrides an ambient one;
  - both credentials land together when `githubToken` and `claudeToken` are given, guarding the generalized helper against dropping one.

## Out of scope

- **Forwarding the token to a remote workspace.** The GitHub token's remote path is a protocol frame field, a version guard on both ends, and a fallback notice (`src/remote/{manager,serve,serve-processes}.ts`, `src/remote/serve-notice.ts`) — four shipped follow-up fixes' worth of surface. A remote workspaced tab keeps authenticating the way it does today. `RemoteProcesses` builds its own `SandboxOptions`, so nothing here half-wires that path.
- **Widening or narrowing any sandbox filesystem carve-in**, including the `.claude/.credentials.json` deny this works around. The deny is correct; the env var is the supported way past it.
- **`ENV_SCRUB_PATTERNS`** — see the Approach note.
- **`.codex/config.toml`'s `shell_environment_policy.filters`.** Codex's default exclusion set drops `*TOKEN*`, so a codex harness would not pass this variable to its subcommands — but codex authenticates with its own credential and never runs `claude`, so there is nothing to fix there.
- **A UI or command to create the token file**, and any writing to it. Janissary only ever reads it, matching `.janissary/github-token`.
- **User documentation.** No page in `documentation/user-documentation/` currently describes how a workspaced harness authenticates to its provider, and this task does not add documentation for previously undocumented behavior.

## Verification

Automated: `./scripts/run.mjs check-diff` after each step.

Manual: with a token from `claude setup-token` saved to `.janissary/claude-token`, open a workspaced `claude` harness tab and confirm it starts authenticated; on a Keychain-less host, confirm the same tab no longer reports itself logged out.
