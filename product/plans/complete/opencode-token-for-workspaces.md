# Pass an OpenCode API key to local and remote workspaced tabs

**Complexity: 4/10** — a third token through a chain that already carries two, local and remote legs together. No new architecture: every step has a working precedent in `claude-token-for-workspaces.md` and `forward-claude-token-to-remote-workspaces.md`.

A workspaced `opencode` harness authenticates from `~/.local/share/opencode/auth.json`, and that file sits under `.local/share/opencode`, already a sandbox read and write carve-out. So a local opencode tab works today and this changes nothing for it in the ordinary case. What has no answer is a machine with no opencode credentials of its own, which on a remote launch is the normal state: the workspace is provisioned on a host whose account may never have run `opencode auth login`.

The credential that fixes it is unusually simple. OpenCode Zen and OpenCode Go are declared in the models catalog opencode reads with `"env": ["OPENCODE_API_KEY"]`, and the stored credential is `type: "api"` — a static key with no refresh token and no expiry. Nothing to mint, nothing to rotate on a schedule, and no version-sensitive refresh behavior. It drops into the shape the Claude token already uses.

## Approach

**Mirror the Claude token exactly, on both legs.** New `src/opencode-token.ts` reads `.janissary/opencode-token` and caches it, loaded in `main.ts` and in `runRemoteServer`. `SandboxOptions` gains `opencodeToken`, injected as `OPENCODE_API_KEY` by `workspaceCredentialEnv`. The `provision` frame gains `opencodeToken`, sent by `RemoteManager` and resolved on the far side against the remote's own file. `RemoteProcesses`'s `credentials` object gains `opencode`.

**Bump `REMOTE_PROTOCOL_VERSION` to 4.** Same rule as the last two bumps, stated on the constant itself: the version covers what the frames carry, so a field one end fills and the other is expected to honor moves it. A version-3 remote honors both existing tokens and drops this one, provisioning a tab whose opencode harness falls back to that machine's own credentials or to none.

**Not added to `ENV_SCRUB_PATTERNS`.** `OPENCODE_API_KEY` matches none of the current patterns, and it should not: it is an LLM provider key, and the scrub deliberately exempts those so harnesses can use their own. Same treatment `CLAUDE_CODE_OAUTH_TOKEN` and `ANTHROPIC_API_KEY` already get. An ambient value keeps passing through, and a configured token file takes precedence over it in the environment janissary builds.

**No credential notice.** Same reasoning that kept one off the Claude token: a missing GitHub token is invisible until a much later push fails, which is why that notice exists, while an unauthenticated harness reports itself in its own output. Most launches will have no opencode token configured and be working exactly as intended.

**Injected for any workspaced spawn**, not only an opencode harness tab, matching both existing tokens. An agent tab's shell can run `opencode` directly.

## Implementation steps

1. `src/opencode-token.ts` — `loadOpencodeToken`, `getOpencodeToken`, module-level cache. Mirror `src/claude-token.ts` structure and comment style; the comment names what consumes it (OpenCode Zen and OpenCode Go, the two providers declaring this variable).
2. `src/main.ts` — call `loadOpencodeToken(cwd)` beside the other two loaders.
3. `src/sandbox/index.ts` — add `opencodeToken?: string` to `SandboxOptions` with a comment; add the conditional spread to `workspaceCredentialEnv` and extend that function's comment to cover the third token.
4. `src/shell-manager.ts`, `src/pseudoterminal-manager.ts`, `src/acp/index.ts` — pass `opencodeToken: <workspaced> ? getOpencodeToken() : undefined` beside the existing two.
5. `src/remote/protocol.ts` — add `opencodeToken?: string` to the `provision` variant; bump `REMOTE_PROTOCOL_VERSION` to `4` and extend the constant's comment with what version 4 is.
6. `src/remote/serve-processes.ts` — `credentials` gains `opencode?: string`, passed into both the PTY and pipe sandbox options.
7. `src/remote/serve.ts` — `loadOpencodeToken(resolved.root)` at startup; take `frame.opencodeToken` through `dispatch` into `provision`; resolve against `getOpencodeToken()` into the `credentials` object.
8. `src/remote/manager.ts` — send `opencodeToken: getOpencodeToken()` on the `provision` frame.
9. `product/specs/sandbox.md` — extend "Environment scrubbing" with the third variable and why it is not scrubbed.
10. `product/specs/workspaced-agent.md` — extend "Harness authentication" to cover opencode, including that a local opencode tab already reads its own credentials through the existing carve-in, so the file matters mainly where the machine has none.
11. `product/specs/remote-server.md` — add the third token to the credential paragraph in "What is computed where" and to the version rationale in "Failures".
12. `documentation/user-documentation/advanced-agents/tokens.md` — third row in the file table, a section on obtaining the key, and the remote behavior.
13. `documentation/user-documentation/advanced-agents/remote-agents.md` — fold the third token into the credential paragraph.

## Tests

- `src/opencode-token.test.ts` (new, mirroring `src/claude-token.test.ts`): trimmed token when the file exists and cached for `getOpencodeToken`; `undefined` when missing; `undefined` when empty.
- `src/sandbox/index.test.ts`: injects `OPENCODE_API_KEY` on a confined workspaced spawn; still injects it on the unconfined pass-through path; leaves an ambient value alone when no token is configured, pinning the deliberate absence from the scrub list; all three credentials land together when all three tokens are given.
- `src/remote/protocol.test.ts`: a `provision` frame carrying all three tokens round-trips intact; a handshake announcing version 3 is refused, naming both versions.
- `src/remote/serve-processes.test.ts`: PTY and pipe spawns both receive `opencodeToken` from the one `credentials` object.
- `src/remote/serve.test.ts`: a forwarded `opencodeToken` reaches the spawned process and adds no notice; with none forwarded, the remote's own configured token is used.

## Out of scope

- **Collapsing the three token loader modules into one.** `github-token.ts`, `claude-token.ts`, and `opencode-token.ts` will be near-identical twenty-line files. Worth revisiting, but a shared loader plus a registry is the kind of restructuring that should be its own change with its own plan, not a rider on adding the third token.
- **A credential notice**, **`ENV_SCRUB_PATTERNS`**, and **any sandbox carve-in change** — see the Approach notes.
- **Any claim about how opencode resolves an injected `OPENCODE_API_KEY` against an existing `auth.json`.** Verifying the precedence would take a live billed API call, so the spec and documentation describe what janissary injects and stop there.
- **opencode providers other than Zen and Go.** `OPENCODE_API_KEY` is what those two declare; a project using opencode against Anthropic or OpenAI directly is configuring a different variable, and that is the user's own environment to manage.
- **A UI or command for creating the token file.** Janissary only reads it, as with the other two.

## Verification

Automated: `./scripts/run.mjs check-diff` after each step, plus `npm run docs:build` for the documentation steps.

Manual: with an OpenCode key in `.janissary/opencode-token`, run `harness opencode` locally and `harness opencode on <host>` against a machine that has never run `opencode auth login`, and confirm the remote tab authenticates rather than prompting for a provider.
